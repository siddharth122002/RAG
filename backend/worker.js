import { Worker } from "bullmq";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CohereEmbeddings } from "@langchain/cohere";
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
import fs from "fs";
import IORedis from "ioredis";
import dotenv from "dotenv";
dotenv.config();
const connection = new IORedis(process.env.UPSTASH, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  lazyConnect: true,
  tls: {},
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
      fs.unlinkSync(data.path);
    } catch (err) {
      console.error("❌ PDF load failed:", err);
    }
  },
  {
    concurrency: 100,
    connection,
  }
);
