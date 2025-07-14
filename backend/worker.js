import { Worker } from "bullmq";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CohereEmbeddings } from "@langchain/cohere";
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
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
        apiKey: "0CA0wZXtOBsjPQ4X6IcEQyReKzv2t8axCcZG8OZq",
      });
      const client = new QdrantClient({
        url: "http://localhost:6333",
        apiKey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.dTPTnqmFZrVWfT1Y4SwqwA7awZQa3mQfjWO4srdueBA",
      });

      const vectorStore = await QdrantVectorStore.fromDocuments(
        texts,
        embeddings,
        {
          client,
          collectionName: "pdf-collection",
        }
      );
    } catch (err) {
      console.error("❌ PDF load failed:", err);
    }
  },
  {
    concurrency: 100,
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);
