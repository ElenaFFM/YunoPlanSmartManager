import { NextResponse } from "next/server";
import { authorizeRequest } from "@/modules/identity/application/authorize-request";
import { recordTestCaseResult } from "@/modules/sdk-lab/application/test-run-service";
import { planningErrorResponse, recordTestCaseResultSchema } from "@/modules/planning/http/planning-http";

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  try {
    const actor = await authorizeRequest(request, ["OPERATOR", "ADMIN"]);
    const { caseId } = await params;
    const input = recordTestCaseResultSchema.parse(await request.json());
    const updated = await recordTestCaseResult({
      testCaseResultId: caseId,
      observedInstallments: input.observedInstallments,
      result: input.result,
      justification: input.justification,
      testedById: actor.id,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return planningErrorResponse(error);
  }
}
