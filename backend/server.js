import express from "express";
import cors from "cors";
import multer from "multer";

import { Queue } from "bullmq";
import { QdrantClient } from "@qdrant/js-client-rest";
import { ChatCohere, Cohere, CohereEmbeddings } from "@langchain/cohere";
import { QdrantVectorStore } from "@langchain/qdrant";

const queue = new Queue("pdfQueue", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});

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
  const { message, context, uniqueId } = req.body;
  if (!uniqueId) {
    return res.status(401).send({ msg: "Cant find document, upload again." });
  }
  const embeddings = new CohereEmbeddings({
    model: "embed-english-v3.0",
    apiKey: "0CA0wZXtOBsjPQ4X6IcEQyReKzv2t8axCcZG8OZq",
  });
  const client = new QdrantClient({
    url: "http://localhost:6333",
    apiKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.dTPTnqmFZrVWfT1Y4SwqwA7awZQa3mQfjWO4srdueBA",
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
      must: {
        key: "metadata.uniqueId",
        match: { value: String(uniqueId) },
      },
    },
  });
  const result = await ret.invoke(message);
  const chatModel = new ChatCohere({
    apiKey: "0CA0wZXtOBsjPQ4X6IcEQyReKzv2t8axCcZG8OZq",
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
});
app.listen(4000, () => {
  console.log("listening");
});
