import express from "express";

import * as store from "../storage/jsonStore";
import {
  buildBridgerPayloadForEvents,
  buildBridgerPayloadForNode,
  buildValidatorPayload,
} from "../services/contextRouterService";
import { callBridger } from "../agents/bridgerClient";
import { callValidator } from "../agents/validatorClient";

export const router = express.Router();

function asyncHandler(fn: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// PROJECTS
router.get(
  "/projects",
  asyncHandler(async (_req, res) => {
    const projects = await store.listProjects();
    res.json(projects);
  })
);

router.post(
  "/projects",
  asyncHandler(async (req, res) => {
    const { projectId, name, description } = req.body;
    const created = await store.createProject({ projectId, name, description });
    res.status(201).json(created);
  })
);

// CHARACTERS
router.get(
  "/projects/:projectId/characters",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const characters = await store.findCharacters(projectId);
    res.json(characters);
  })
);

router.post(
  "/projects/:projectId/characters",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { projectId: _p, ...body } = req.body;
    const created = await store.createCharacter(projectId, body);
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/characters/:characterId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const characterId = req.params.characterId as string;
    const updated = await store.updateCharacter(projectId, characterId, req.body);
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/characters/:characterId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const characterId = req.params.characterId as string;
    const deleted = await store.deleteCharacter(projectId, characterId);
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    res.sendStatus(204);
  })
);

// WORLD RULES
router.get(
  "/projects/:projectId/world-rules",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const rules = await store.findWorldRules(projectId);
    res.json(rules);
  })
);

router.post(
  "/projects/:projectId/world-rules",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { projectId: _p, ...body } = req.body;
    const created = await store.createWorldRule(projectId, body);
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/world-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const ruleId = req.params.ruleId as string;
    const updated = await store.updateWorldRule(projectId, ruleId, req.body);
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/world-rules/:ruleId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const ruleId = req.params.ruleId as string;
    const deleted = await store.deleteWorldRule(projectId, ruleId);
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    res.sendStatus(204);
  })
);

// EVENTS
router.get(
  "/projects/:projectId/events",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const events = await store.findEvents(projectId);
    res.json(events);
  })
);

router.post(
  "/projects/:projectId/events",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { projectId: _p, ...body } = req.body;
    const created = await store.createEvent(projectId, body);
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/events/:eventId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const eventId = req.params.eventId as string;
    const updated = await store.updateEvent(projectId, eventId, req.body);
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    res.json(updated);
  })
);

router.delete(
  "/projects/:projectId/events/:eventId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const eventId = req.params.eventId as string;
    const deleted = await store.deleteEvent(projectId, eventId);
    if (!deleted) {
      res.sendStatus(404);
      return;
    }
    res.sendStatus(204);
  })
);

// STORYLINE NODES
router.get(
  "/projects/:projectId/storyline-nodes",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { status } = req.query;
    const filter = typeof status === "string" ? { status } : undefined;
    const nodes = await store.findStorylineNodes(projectId, filter);
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

    if (nodeId && result.bridging_steps.length > 0) {
      const content = result.bridging_steps.map((s) => s.action).join("\n\n");
      await store.updateStorylineNode(projectId, nodeId, {
        content,
        status: "draft",
      });
    }

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
      const node = await store.findStorylineNode(projectId, nodeId);
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
      await store.updateStorylineNode(projectId, nodeId, {
        status: result.pass ? "stable" : "needs_revision",
        lastCheckResult: {
          pass: result.pass,
          violations: result.violations,
          checkedAt: new Date().toISOString(),
        },
      });
    }

    res.json(result);
  })
);

router.post(
  "/projects/:projectId/storyline-nodes",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const { projectId: _p, ...body } = req.body;
    const created = await store.createStorylineNode(projectId, body);
    res.status(201).json(created);
  })
);

router.put(
  "/projects/:projectId/storyline-nodes/:nodeId",
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string;
    const nodeId = req.params.nodeId as string;
    const updated = await store.updateStorylineNode(projectId, nodeId, req.body);
    if (!updated) {
      res.sendStatus(404);
      return;
    }
    res.json(updated);
  })
);
