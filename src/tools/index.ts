import { uploadCvTool, cvUploadStatusTool } from '../ui/panel.ts';
import { alertTools } from './alerts.ts';
import { jobTools, companyTool } from './jobs.ts';
import { profileTools } from './profile.ts';
import { cvsTools } from './cvs.ts';
import { documentTools } from './documents.ts';
import { applicationsTools } from './applications.ts';
import { activityTools, learningTools } from './activity.ts';
import { accountTools, workflowTool } from './account.ts';
import type { ToolDefinition } from './schemas.ts';

export const careerTools: ToolDefinition[] = [
  workflowTool,
  ...profileTools,
  ...cvsTools,
  ...documentTools,
  ...activityTools,
  ...applicationsTools,
  ...learningTools,
  ...accountTools,
];

/** One catalogue for discovery, validation and REST dispatch. */
export function getTools(careerEnabled = true): ToolDefinition[] {
  return careerEnabled
    ? [...jobTools, ...careerTools, companyTool, ...alertTools, uploadCvTool, cvUploadStatusTool]
    : [...jobTools, ...alertTools];
}
