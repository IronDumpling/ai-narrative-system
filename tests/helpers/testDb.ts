import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

export class TestDb {
  private mongo?: MongoMemoryServer;

  async setup() {
    this.mongo = await MongoMemoryServer.create();
    const uri = this.mongo.getUri();
    process.env.MONGODB_URI = uri;
    const { connectMongo } = await import("../../backend/src/config/db");
    await connectMongo();
  }

  async cleanup() {
    if (mongoose.connection.readyState !== 1) return;
    const db = mongoose.connection.db;
    if (!db) return;
    const collections = await db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  }

  async teardown() {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (this.mongo) {
      await this.mongo.stop();
    }
  }
}

