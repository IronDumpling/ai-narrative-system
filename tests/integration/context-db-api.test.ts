import request from "supertest";

import { createApp } from "../../backend/src/app";
import { TestDb } from "../helpers/testDb";
import { ProjectModel } from "../../backend/src/models/project.model";

const testDb = new TestDb();
const app = createApp();

describe("Context DB CRUD + dbVersion integration", () => {
  beforeAll(async () => {
    await testDb.setup();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  async function getProject(projectId: string) {
    return ProjectModel.findOne({ projectId }).lean().exec();
  }

  it("creates a project with initial dbVersion = 1", async () => {
    const res = await request(app)
      .post("/api/projects")
      .send({ projectId: "demo", name: "Demo Project" })
      .expect(201);

    expect(res.body.projectId).toBe("demo");
    const project = await getProject("demo");
    expect(project?.dbVersion).toBe(1);
  });

  it("increments dbVersion on Character / WorldRule / Event mutations", async () => {
    await request(app)
      .post("/api/projects")
      .send({ projectId: "demo", name: "Demo Project" })
      .expect(201);

    let project = await getProject("demo");
    expect(project?.dbVersion).toBe(1);

    // Create a character
    await request(app)
      .post("/api/projects/demo/characters")
      .send({
        characterId: "char_001",
        name: "Elias",
        coreTraits: ["Pragmatic"],
        flaws: [],
        motivations: [],
        relationships: [],
      })
      .expect(201);
    project = await getProject("demo");
    expect(project?.dbVersion).toBe(2);

    // Create a world rule
    await request(app)
      .post("/api/projects/demo/world-rules")
      .send({
        ruleId: "rule_001",
        category: "Physics_Magic",
        description: "Using neural-implants drains physical stamina exponentially.",
        strictnessLevel: "High",
      })
      .expect(201);
    project = await getProject("demo");
    expect(project?.dbVersion).toBe(3);

    // Create an event
    await request(app)
      .post("/api/projects/demo/events")
      .send({
        eventId: "evt_001",
        timelineOrder: 10,
        title: "The Server Room Breach",
        objectiveFacts: "The main server was destroyed at 02:00 AM by an unknown explosive.",
        involvedCharacterIds: ["char_001"],
      })
      .expect(201);
    project = await getProject("demo");
    expect(project?.dbVersion).toBe(4);

    // Update character
    await request(app)
      .put("/api/projects/demo/characters/char_001")
      .send({ coreTraits: ["Pragmatic", "Suspicious"] })
      .expect(200);
    project = await getProject("demo");
    expect(project?.dbVersion).toBe(5);

    // Delete event
    await request(app).delete("/api/projects/demo/events/evt_001").expect(204);
    project = await getProject("demo");
    expect(project?.dbVersion).toBe(6);
  });

  it("supports basic StorylineNode CRUD and status filtering", async () => {
    await request(app)
      .post("/api/projects")
      .send({ projectId: "demo", name: "Demo Project" })
      .expect(201);

    // Create storyline nodes
    await request(app)
      .post("/api/projects/demo/storyline-nodes")
      .send({
        nodeId: "story_1",
        characterId: "char_001",
        eventId: "evt_001",
        content: "Initial draft",
      })
      .expect(201);

    await request(app)
      .post("/api/projects/demo/storyline-nodes")
      .send({
        nodeId: "story_2",
        characterId: "char_002",
        eventId: "evt_002",
        content: "Another draft",
        status: "needs_revision",
      })
      .expect(201);

    const allRes = await request(app)
      .get("/api/projects/demo/storyline-nodes")
      .expect(200);
    expect(allRes.body.length).toBe(2);

    const needsRevisionRes = await request(app)
      .get("/api/projects/demo/storyline-nodes")
      .query({ status: "needs_revision" })
      .expect(200);
    expect(needsRevisionRes.body.length).toBe(1);
    expect(needsRevisionRes.body[0].nodeId).toBe("story_2");
  });
});

