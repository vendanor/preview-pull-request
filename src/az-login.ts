import * as core from "@actions/core";

import { FormatType, SecretParser } from "actions-secret-parser";
import { executeAzCliCommand } from './az-run-command';

/**
 * Mostly copy-paste from here: https://github.com/Azure/login/blob/master/src/main.ts
 * @param token
 */
export async function loginAzure(token: string) {
  try {
    const prefix = !!process.env.AZURE_HTTP_USER_AGENT
      ? `${process.env.AZURE_HTTP_USER_AGENT}`
      : "";
    const azPSHostEnv = !!process.env.AZUREPS_HOST_ENVIRONMENT
      ? `${process.env.AZUREPS_HOST_ENVIRONMENT}`
      : "";

    let usrAgentRepo = `${process.env.GITHUB_REPOSITORY}`;
    let actionName = "AzureLogin";
    let userAgentString =
      (!!prefix ? `${prefix}+` : "") +
      `GITHUBACTIONS/${actionName}@v1_${usrAgentRepo}`;
    let azurePSHostEnv =
      (!!azPSHostEnv ? `${azPSHostEnv}+` : "") +
      `GITHUBACTIONS/${actionName}@v1_${usrAgentRepo}`;
    core.exportVariable("AZURE_HTTP_USER_AGENT", userAgentString);
    core.exportVariable("AZUREPS_HOST_ENVIRONMENT", azurePSHostEnv);

    await executeAzCliCommand("--version");
    let secrets = new SecretParser(token, FormatType.JSON);
    let servicePrincipalId = secrets.getSecret("$.clientId", false);
    let servicePrincipalKey = secrets.getSecret("$.clientSecret", true);
    let tenantId = secrets.getSecret("$.tenantId", false);
    let subscriptionId = secrets.getSecret("$.subscriptionId", false);
    if (
      !servicePrincipalId ||
      !servicePrincipalKey ||
      !tenantId ||
      !subscriptionId
    ) {
      throw new Error(
        "Not all values are present in the azure credentials object. Ensure clientId, clientSecret, tenantId and subscriptionId are supplied."
      );
    }

    await executeAzCliCommand(
      `login --service-principal -u "${servicePrincipalId}" -p "${servicePrincipalKey}" --tenant "${tenantId}"`,
      true
    );
    await executeAzCliCommand(
      `account set --subscription "${subscriptionId}"`,
      true
    );

    core.info("🙌 Login to azure - Great success! 🙌");
  } catch (error) {
    core.error("Login to azure failed 🎃");
    throw new Error(error);
  }
}
