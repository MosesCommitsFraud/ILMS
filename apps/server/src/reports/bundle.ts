import { getCase } from "../cases/store";
import { listArtifacts, listRuns } from "../runs/store";
import { listTargets } from "../targets/store";

import type { ReportBundle } from "./render";

export function loadReportBundle(caseId: string): ReportBundle {
  return {
    case: getCase(caseId),
    targets: listTargets(caseId),
    runs: listRuns(caseId),
    artifacts: listArtifacts({ caseId }),
  };
}
