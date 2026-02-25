import { TestDb } from "../helpers/testDb";
import {
  incrementProjectVersionAndLogChanges,
  markAffectedStorylineNodes,
} from "../../backend/src/services/versioningService";
import { ProjectModel } from "../../backend/src/models/project.model";
import { StorylineNodeModel } from "../../backend/src/models/storylineNode.model";
import { DbChangeLogModel } from "../../backend/src/models/dbChangeLog.model";

jest.setTimeout(30000);

const testDb = new TestDb();

describe("versioningService", () => {
  beforeAll(async () => {
    await testDb.setup();
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  afterAll(async () => {
    await testDb.teardown();
  });

  it("increments project dbVersion and writes DbChangeLog", async () => {
    await ProjectModel.create({ projectId: "demo", name: "Demo Project" });

    const before = await ProjectModel.findOne({ projectId: "demo" }).lean().exec();
    expect(before?.dbVersion).toBe(1);

    const log = await incrementProjectVersionAndLogChanges("demo", "Character", ["char_001"], "Create character");

    const after = await ProjectModel.findOne({ projectId: "demo" }).lean().exec();
    expect(after?.dbVersion).toBe(2);

    expect(log.projectId).toBe("demo");
    expect(log.fromVersion).toBe(1);
    expect(log.toVersion).toBe(2);
    expect(log.entityType).toBe("Character");
    expect(log.entityIds).toEqual(["char_001"]);

    const logs = await DbChangeLogModel.find({ projectId: "demo" }).lean().exec();
    expect(logs).toHaveLength(1);
  });

  it("marks only matching character storyline nodes as needs_revision", async () => {
    await ProjectModel.create({ projectId: "demo", name: "Demo Project", dbVersion: 3 });

    await StorylineNodeModel.create([
      {
        projectId: "demo",
        nodeId: "n1",
        characterId: "char_001",
        eventId: "evt_001",
        content: "Node 1",
        status: "draft",
        dbVersionSnapshot: 1,
      },
      {
        projectId: "demo",
        nodeId: "n2",
        characterId: "char_002",
        eventId: "evt_001",
        content: "Node 2",
        status: "draft",
        dbVersionSnapshot: 1,
      },
      {
        projectId: "demo",
        nodeId: "n3",
        characterId: "char_001",
        eventId: "evt_002",
        content: "Node 3",
        status: "stable",
        dbVersionSnapshot: 5, // already ahead of toVersion
      },
    ]);

    const modified = await markAffectedStorylineNodes("demo", "Character", ["char_001"], 3);
    expect(modified).toBe(1);

    const n1 = await StorylineNodeModel.findOne({ projectId: "demo", nodeId: "n1" }).lean().exec();
    const n2 = await StorylineNodeModel.findOne({ projectId: "demo", nodeId: "n2" }).lean().exec();
    const n3 = await StorylineNodeModel.findOne({ projectId: "demo", nodeId: "n3" }).lean().exec();

    expect(n1?.status).toBe("needs_revision");
    expect(n1?.dbVersionSnapshot).toBe(3);

    expect(n2?.status).toBe("draft");
    expect(n2?.dbVersionSnapshot).toBe(1);

    expect(n3?.status).toBe("stable");
    expect(n3?.dbVersionSnapshot).toBe(5);
  });

  it("marks nodes by event when entityType is Event", async () => {
    await ProjectModel.create({ projectId: "demo", name: "Demo Project", dbVersion: 1 });

    await StorylineNodeModel.create([
      {
        projectId: "demo",
        nodeId: "n1",
        characterId: "char_001",
        eventId: "evt_001",
        content: "Node 1",
        status: "draft",
      },
      {
        projectId: "demo",
        nodeId: "n2",
        characterId: "char_002",
        eventId: "evt_002",
        content: "Node 2",
        status: "draft",
      },
    ]);

    const modified = await markAffectedStorylineNodes("demo", "Event", ["evt_001"], 2);
    expect(modified).toBe(1);

    const n1 = await StorylineNodeModel.findOne({ projectId: "demo", nodeId: "n1" }).lean().exec();
    const n2 = await StorylineNodeModel.findOne({ projectId: "demo", nodeId: "n2" }).lean().exec();

    expect(n1?.status).toBe("needs_revision");
    expect(n2?.status).toBe("draft");
  });

  it("marks all nodes in project when entityType is WorldRule", async () => {
    await ProjectModel.create({ projectId: "demo", name: "Demo Project", dbVersion: 1 });

    await StorylineNodeModel.create([
      {
        projectId: "demo",
        nodeId: "n1",
        characterId: "char_001",
        eventId: "evt_001",
        content: "Node 1",
        status: "draft",
      },
      {
        projectId: "demo",
        nodeId: "n2",
        characterId: "char_002",
        eventId: "evt_002",
        content: "Node 2",
        status: "draft",
      },
    ]);

    const modified = await markAffectedStorylineNodes("demo", "WorldRule", ["rule_001"], 2);
    expect(modified).toBe(2);

    const nodes = await StorylineNodeModel.find({ projectId: "demo" }).lean().exec();
    expect(nodes.every((n) => n.status === "needs_revision" && n.dbVersionSnapshot === 2)).toBe(true);
  });
});

