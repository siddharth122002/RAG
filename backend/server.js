import express from "express";
import cors from "cors";
import multer from "multer";
import IORedis from "ioredis";
import { Queue } from "bullmq";
import { QdrantClient } from "@qdrant/js-client-rest";
import { ChatCohere, Cohere, CohereEmbeddings } from "@langchain/cohere";
import { QdrantVectorStore } from "@langchain/qdrant";
import dotenv from "dotenv";
import { Worker } from "bullmq";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import fs from "fs";
dotenv.config();

const redisConnection = new IORedis(process.env.UPSTASH, {
  maxRetriesPerRequest: null,
  tls: {},
  enableOfflineQueue: false,
  lazyConnect: true,
});

const queue = new Queue("pdfQueue", {
  connection: redisConnection,
});
const worker = new Worker(
  "pdfQueue",
  async (job) => {
    try {
      const data = JSON.parse(job.data);
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 0,
      });
      let texts = await textSplitter.splitDocuments(docs);
      texts = texts.map((doc) => {
        doc.metadata.uniqueId = data.uniqueId;
        return doc;
      });

      const embeddings = new CohereEmbeddings({
        model: "embed-english-v3.0",
        apiKey: process.env.COHERE,
      });
      const client = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_KEY,
      });

      const vectorStore = await QdrantVectorStore.fromDocuments(
        texts,
        embeddings,
        {
          client,
          collectionName: "pdf-collection",
        }
      );
      setTimeout(() => {
        try {
          fs.unlinkSync(data.path);
        } catch (err) {
          console.error("File deletion error:", err);
        }
      }, 5000);
    } catch (err) {
      console.error("❌ PDF load failed:", err);
    }
  },
  {
    concurrency: 100,
    connection: redisConnection,
  }
);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "dump/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + file.originalname);
  },
});

const upload = multer({ storage: storage });
const app = express();
app.use(cors());
app.use(express.json());

app.post("/upload", upload.single("pdff"), async (req, res) => {
  const { uniqueId } = req.body;
  await queue.add(
    "pdf doing",
    JSON.stringify({
      uniqueId: uniqueId,
      filename: req.file.originalname,
      destination: req.file.destination,
      path: req.file.path,
    })
  );
  res.send({ msg: "oks" });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, context, uniqueId } = req.body;
    if (!uniqueId) {
      return res.status(401).send({ msg: "Cant find document, upload again." });
    }
    const embeddings = new CohereEmbeddings({
      model: "embed-english-v3.0",
      apiKey: process.env.COHERE,
    });
    const client = new QdrantClient({
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_KEY,
    });

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        client,
        collectionName: "pdf-collection",
      }
    );
    const ret = vectorStore.asRetriever({
      k: 5,
      filter: {
        must: [
          {
            key: "metadata.uniqueId",
            match: {
              value: uniqueId,
            },
          },
        ],
      },
      limit: 3,
      with_payload: true,
    });
    const result = await ret.invoke(message);

    if (!result || result.length === 0) {
      return res.send({ msg: "Your Pdf is missing!!" });
    }
    const chatModel = new ChatCohere({
      apiKey: process.env.COHERE,
      temperature: 0.3,
      max_tokens: 300,
    });
    const SYSTEM_PROMPT = `You are a helpful AI assistant using Retrieval-Augmented Generation (RAG).
    Answer the user's question based only on the context provided below, which is extracted from a PDF.

    Context:
    ${result.map((r, i) => `Section ${i + 1}:\n${r.pageContent}`).join("\n\n")}
  If the answer is not present or cannot be reasonably inferred, say so honestly.`;
    const chatHistory = context.slice(-6).map((c) => ({
      role: c.type === "user" ? "user" : "assistant",
      content: c.text,
    }));

    const chatResult = await chatModel.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      ...chatHistory,
      { role: "user", content: message },
    ]);

    res.send({ msg: chatResult.content });
  } catch (e) {
    console.log("---err", e);
  }
});

app.get("/ping", (req, res) => {
  res.send({ msg: "alive" });
});
app.listen(process.env.PORT, () => {
  console.log("listening");
});
