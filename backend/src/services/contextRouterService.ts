import { CharacterModel } from "../models/character.model";
import { WorldRuleModel } from "../models/worldRule.model";
import { EventModel } from "../models/event.model";
import { StorylineNodeModel } from "../models/storylineNode.model";

export interface BridgerPayload {
  task: string;
  character_context: unknown;
  world_context: unknown[];
  start_event: string;
  end_event: string;
  existing_content?: string;
}

export interface ValidatorPayload {
  task: string;
  character_traits: string[];
  world_rules: string[];
  text_to_verify: string;
}

export async function buildBridgerPayloadForEvents(options: {
  projectId: string;
  characterId: string;
  startEventId: string;
  endEventId: string;
}): Promise<BridgerPayload> {
  const { projectId, characterId, startEventId, endEventId } = options;

  const [character, worldRules, startEvent, endEvent] = await Promise.all([
    CharacterModel.findOne({ projectId, characterId }).lean().exec(),
    WorldRuleModel.find({ projectId }).lean().exec(),
    EventModel.findOne({ projectId, eventId: startEventId }).lean().exec(),
    EventModel.findOne({ projectId, eventId: endEventId }).lean().exec(),
  ]);

  if (!character) {
    throw new Error(`Character not found for projectId=${projectId}, characterId=${characterId}`);
  }
  if (!startEvent || !endEvent) {
    throw new Error(`Start or end event not found for projectId=${projectId}`);
  }

  return {
    task: "Generate POV storyline connecting Start_Event and End_Event.",
    character_context: character,
    world_context: worldRules,
    start_event: `${startEvent.eventId}: ${startEvent.title}`,
    end_event: `${endEvent.eventId}: ${endEvent.title}`,
  };
}

export async function buildBridgerPayloadForNode(options: {
  projectId: string;
  nodeId: string;
}): Promise<BridgerPayload> {
  const { projectId, nodeId } = options;
  const node = await StorylineNodeModel.findOne({ projectId, nodeId }).lean().exec();
  if (!node) {
    throw new Error(`StorylineNode not found for projectId=${projectId}, nodeId=${nodeId}`);
  }

  return buildBridgerPayloadForEvents({
    projectId,
    characterId: node.characterId,
    startEventId: node.eventId,
    endEventId: node.eventId,
  }).then((payload) => ({
    ...payload,
    existing_content: node.content,
  }));
}

export async function buildValidatorPayload(options: {
  projectId: string;
  characterId: string;
  textToVerify: string;
  worldRuleIds?: string[];
}): Promise<ValidatorPayload> {
  const { projectId, characterId, worldRuleIds, textToVerify } = options;

  const [character, worldRulesAll] = await Promise.all([
    CharacterModel.findOne({ projectId, characterId }).lean().exec(),
    WorldRuleModel.find({ projectId }).lean().exec(),
  ]);

  if (!character) {
    throw new Error(`Character not found for projectId=${projectId}, characterId=${characterId}`);
  }

  const worldRules =
    worldRuleIds && worldRuleIds.length > 0
      ? worldRulesAll.filter((r) => worldRuleIds.includes(r.ruleId))
      : worldRulesAll;

  const characterTraits = character.coreTraits ?? [];
  const worldRuleDescriptions = worldRules.map((r) => r.description);

  return {
    task: "Verify if the provided text violates Character Traits or World Rules.",
    character_traits: characterTraits,
    world_rules: worldRuleDescriptions,
    text_to_verify: textToVerify,
  };
}

