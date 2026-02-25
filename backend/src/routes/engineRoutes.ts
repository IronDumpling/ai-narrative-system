import express from "express";

import { ProjectModel } from "../models/project.model";
import { CharacterModel } from "../models/character.model";
import { WorldRuleModel } from "../models/worldRule.model";
import { EventModel } from "../models/event.model";
import { StorylineNodeModel } from "../models/storylineNode.model";
import { incrementProjectVersionAndLogChanges, markAffectedStorylineNodes } from "../services/versioningService";
import { EntityType } from "../models/dbChangeLog.model";
import {
  buildBridgerPayloadForEvents,
  buildBridgerPayloadForNode,
  buildValidatorPayload,
} from "../services/contextRouterService";
import { callBridger } from "../agents/bridgerClient";
import { callValidator } from "../agents/validatorClient";

export const router = express.Router();

// Helper to wrap async handlers
function asyncHandler(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// PROJECTS
router.get(
  "/projects",
  asyncHandler(async (_req, res) => {
    const projects = await ProjectModel.find().lean().exec();
    res.json(projects);
  })
);

router.post(
  "/projects",
  asyncHandler(async (req, res) => {
    const { projectId, name, description } = req.body;
    const created = await ProjectModel.create({
      projectId,
      name,
      description,
    });
    res.status(201).json(created);
  })
);

// CONTEXT DB HELPERS
async function applyVersioningAndMarkNodes(
  projectId: string,
  entityType: EntityType,
  entityIds: string[],
  changeSummary?: string
) {
  const log = await incrementProjectVersionAndLogChanges(projectId, entityType, entityIds, changeSummary);
  await markAffectedStorylineNodes(projectId, entityType, entityIds, log.toVersion);
}

// CHARACTERS
router.get(
  "/projects/:projectId/characters",
  asyncHandler(async (req, res) => {
    const characters = await CharacterModel.find({ projectId: req.params.projectId }).lean().exec();
    res.json(characters);
  })
);

router.post(
  "/projects/:projectId/characters",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const created = await CharacterModel.create({ ...req.body, projectId });
    await applyVersioningAndMarkNodes(projectId, "Character", [created.characterId], "Create character");
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/characters/:characterId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const characterId = req.params.characterId as string;
    const updated = await CharacterModel.findOneAndUpdate(
      { projectId, characterId },
      req.body,
      { new: true }
    ).exec();
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "Character", [characterId], "Update character");
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/characters/:characterId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const characterId = req.params.characterId as string;
    const deleted = await CharacterModel.findOneAndDelete({ projectId, characterId }).exec();
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "Character", [characterId], "Delete character");
    res.sendStatus(204);
  })
);

// WORLD RULES
router.get(
  "/projects/:projectId/world-rules",
  asyncHandler(async (req, res) => {
    const rules = await WorldRuleModel.find({ projectId: req.params.projectId }).lean().exec();
    res.json(rules);
  })
);

router.post(
  "/projects/:projectId/world-rules",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const created = await WorldRuleModel.create({ ...req.body, projectId });
    await applyVersioningAndMarkNodes(projectId, "WorldRule", [created.ruleId], "Create world rule");
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/world-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const ruleId = req.params.ruleId as string;
    const updated = await WorldRuleModel.findOneAndUpdate({ projectId, ruleId }, req.body, {
      new: true,
    }).exec();
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "WorldRule", [ruleId], "Update world rule");
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/world-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const ruleId = req.params.ruleId as string;
    const deleted = await WorldRuleModel.findOneAndDelete({ projectId, ruleId }).exec();
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "WorldRule", [ruleId], "Delete world rule");
    res.sendStatus(204);
  })
);

// EVENTS
router.get(
  "/projects/:projectId/events",
  asyncHandler(async (req, res) => {
    const events = await EventModel.find({ projectId: req.params.projectId }).lean().exec();
    res.json(events);
  })
);

router.post(
  "/projects/:projectId/events",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const created = await EventModel.create({ ...req.body, projectId });
    await applyVersioningAndMarkNodes(projectId, "Event", [created.eventId], "Create event");
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/events/:eventId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const eventId = req.params.eventId as string;
    const updated = await EventModel.findOneAndUpdate({ projectId, eventId }, req.body, {
      new: true,
    }).exec();
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "Event", [eventId], "Update event");
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/events/:eventId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const eventId = req.params.eventId as string;
    const deleted = await EventModel.findOneAndDelete({ projectId, eventId }).exec();
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    await applyVersioningAndMarkNodes(projectId, "Event", [eventId], "Delete event");
    res.sendStatus(204);
  })
);

// STORYLINE NODES
router.get(
  "/projects/:projectId/storyline-nodes",
  asyncHandler(async (req, res) => {
    const { projectId } = req.params;
    const { status } = req.query;
    const query: Record<string, unknown> = { projectId };
    if (typeof status === "string") {
      query.status = status;
    }
    const nodes = await StorylineNodeModel.find(query).lean().exec();
    res.json(nodes);
  })
);

// AGENTS: BRIDGER & VALIDATOR

router.post(
  "/projects/:projectId/bridger",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { characterId, startEventId, endEventId, nodeId } = req.body as {
      characterId?: string;
      startEventId?: string;
      endEventId?: string;
      nodeId?: string;
    };

    if (!nodeId && (!characterId || !startEventId || !endEventId)) {
      res.status(400).json({
        error: "Either nodeId or (characterId, startEventId, endEventId) must be provided.",
      });
      return;
    }

    const payload = nodeId
      ? await buildBridgerPayloadForNode({ projectId, nodeId })
      : await buildBridgerPayloadForEvents({
          projectId,
          characterId: characterId as string,
          startEventId: startEventId as string,
          endEventId: endEventId as string,
        });

    const result = await callBridger(payload);
    res.json(result);
  })
);

router.post(
  "/projects/:projectId/validator",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const body = req.body as {
      characterId?: string;
      worldRuleIds?: string[];
      textToVerify?: string;
      nodeId?: string;
    };
    const { characterId, textToVerify, nodeId } = body;

    if (!characterId) {
      res.status(400).json({ error: "characterId is required" });
      return;
    }

    let text = textToVerify;
    if (!text && nodeId) {
      const node = await StorylineNodeModel.findOne({ projectId, nodeId }).lean().exec();
      if (!node) {
        res.sendStatus(404);
        return;
      }
      text = node.content;
    }

    if (!text) {
      res.status(400).json({ error: "textToVerify or nodeId must be provided" });
      return;
    }

    const payload = await buildValidatorPayload(
      body.worldRuleIds
        ? {
            projectId,
            characterId,
            textToVerify: text,
            worldRuleIds: body.worldRuleIds,
          }
        : {
            projectId,
            characterId,
            textToVerify: text,
          }
    );

    const result = await callValidator(payload);

    if (nodeId) {
      await StorylineNodeModel.findOneAndUpdate(
        { projectId, nodeId },
        {
          status: result.pass ? "stable" : "needs_revision",
          lastCheckResult: {
            pass: result.pass,
            violations: result.violations,
            checkedAt: new Date(),
          },
        }
      ).exec();
    }

    res.json(result);
  })
);

router.post(
  "/projects/:projectId/storyline-nodes",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    const created = await StorylineNodeModel.create({ ...req.body, projectId });
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/storyline-nodes/:nodeId",
  asyncHandler(async (req, res) => {
    const { projectId, nodeId } = req.params;
    const updated = await StorylineNodeModel.findOneAndUpdate({ projectId, nodeId }, req.body, {
      new: true,
    }).exec();
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    res.json(updated);
  })
);

