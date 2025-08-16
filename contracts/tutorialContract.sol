// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FunctionsClient} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts@1.4.0/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

/**
 * Request testnet LINK and ETH here: https://faucets.chain.link/
 * Find information on LINK Token Contracts and get the latest ETH and LINK faucets here: https://docs.chain.link/resources/link-token-contracts/
 */
contract GettingStartedFunctionsConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // State variables
    bytes32 public s_lastRequestId;
    bytes public s_lastResponse; // raw CBOR bytes from Functions
    bytes public s_lastError;
    string public player; // decoded player string

    // Custom error
    error UnexpectedRequestID(bytes32 requestId);

    // Events
    event Response(
        bytes32 indexed requestId,
        string decoded,
        bytes rawResponse,
        bytes err
    );

    // Router address - Hardcoded for Sepolia
    address router = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;

    // JavaScript source code
    string source = string(
        abi.encodePacked(
            "const apiResponse = await Functions.makeHttpRequest({",
            "    url: \"https://api.openai.com/v1/chat/completions\",",
            "    method: \"POST\",",
            "    headers: {",
            "        \"Content-Type\": \"application/json\",",
            "        \"Authorization\": \"Bearer *key goes here until i get chainlink secrets working ;)*",
            "    },",
            "    data: {",
            "        model: \"gpt-3.5-turbo\",",
            "        messages: [{ role: \"user\", content: args[0] }],",
            "        max_tokens: 100",
            "    }",
            "});",
            "if (apiResponse.error) {",
            "throw new Error(`Failed to fetch data from Chatbot API: ${apiResponse.error}`);",
            "}",
            "const chatbotReply = apiResponse.data?.choices?.[0]?.message?.content?.trim();",
            "if (!chatbotReply) {",
            "throw new Error(\"No reply returned from Chatbot API.\");",
            "}",
            "return Functions.encodeString(chatbotReply);"
        )
    );

    // Callback gas limit
    uint32 gasLimit = 300000;

    // donID - Hardcoded for Sepolia
    bytes32 donID =
        0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000;

    constructor() FunctionsClient(router) ConfirmedOwner(msg.sender) {}

    /**
     * @notice Sends an HTTP request
     */
    function sendRequest(
        uint64 subscriptionId,
        string[] calldata args
    ) external onlyOwner returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(source);
        if (args.length > 0) req.setArgs(args);

        s_lastRequestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            gasLimit,
            donID
        );

        return s_lastRequestId;
    }

    /**
     * @notice Callback from Chainlink Functions
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (s_lastRequestId != requestId) {
            revert UnexpectedRequestID(requestId);
        }

        s_lastResponse = response;
        s_lastError = err;

        if (err.length == 0 && response.length > 0) {
            // Decode the CBOR-encoded bytes into a string
            player = abi.decode(response, (string));
        } else {
            player = "";
        }

        emit Response(requestId, player, s_lastResponse, s_lastError);
    }

    /**
     * @notice Returns the last error string
     */
    function getLastError() external view returns (string memory) {
        return string(s_lastError);
    }
}
