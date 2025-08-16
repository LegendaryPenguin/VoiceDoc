import { initiateSmartContractPlatformClient } from "@circle-fin/smart-contract-platform";

// Initialize Circle Smart Contract client
export const circleContractSdk = initiateSmartContractPlatformClient({
  apiKey: process.env.CIRCLE_API_KEY as string,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET as string,
});