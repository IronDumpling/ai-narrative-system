import { TestDb } from "../helpers/testDb";
import { ProjectModel } from "../../backend/src/models/project.model";
import { StorylineNodeModel } from "../../backend/src/models/storylineNode.model";

jest.setTimeout(30000);

const testDb = new TestDb();

describe("Mongoose models schemas", () => {
  beforeAll(async () => {
    await testDb.setup();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("enforces required fields on ProjectModel", async () => {
    await expect(ProjectModel.create({})).rejects.toThrow();

    const created = await ProjectModel.create({ projectId: "demo", name: "Demo Project" });
    expect(created.projectId).toBe("demo");
    expect(created.dbVersion).toBe(1);
  });

  it("enforces unique projectId on ProjectModel", async () => {
    await ProjectModel.create({ projectId: "demo", name: "Demo Project" });
    await expect(ProjectModel.create({ projectId: "demo", name: "Duplicate" })).rejects.toThrow();
  });

  it("restricts StorylineNode status enum and applies defaults", async () => {
    const node = await StorylineNodeModel.create({
      projectId: "demo",
      nodeId: "n1",
      characterId: "char_001",
      eventId: "evt_001",
      content: "Some content",
    });

    expect(node.status).toBe("draft");
    expect(node.content).toBe("Some content");

    await expect(
      StorylineNodeModel.create({
        projectId: "demo",
        nodeId: "n2",
        characterId: "char_001",
        eventId: "evt_001",
        content: "Invalid",
        status: "invalid_status",
      } as unknown)
    ).rejects.toThrow();
  });
});

