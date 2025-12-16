// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {FunctionsClient} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {ConfirmedOwner} from "@chainlink/contracts@1.4.0/src/v0.8/shared/access/ConfirmedOwner.sol";
import {FunctionsRequest} from "@chainlink/contracts@1.4.0/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

/// @title ChatGPTConsumer — Chainlink Functions + OpenAI demo (hackathon-safe)
/// @notice Keeps callbacks readable while avoiding DON gas limit reverts
contract ChatGPTConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ===== State =====
    bytes32 public lastRequestId;
    bytes public lastResponse; // raw CBOR payload from Functions
    bytes public lastError;    // raw error payload from Functions
    string public lastAnswer;  // decoded, trimmed ChatGPT answer

    // ===== Events =====
    event Response(bytes32 indexed requestId, string answer, bytes rawResponse, bytes error);

    // ===== Chainlink config (FUJI) =====
    address constant ROUTER = 0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0;
    bytes32 constant DON_ID = 0x66756e2d6176616c616e6368652d66756a692d31000000000000000000000000; // sepolia-1

    // IMPORTANT: Sepolia DON currently caps callback gas at ~300,000.
    // Setting higher will revert during send (gas estimation failure with unknown custom error).
    uint32 constant CALLBACK_GAS_LIMIT = 300000; // <= DON max

    // ===== Off-chain JavaScript (with hardcoded API key for hackathon ONLY) =====
    // - Reduces model tokens and truncates reply on the DON to keep callback gas low.
    // ===== Off-chain JavaScript (adds a hardcoded system prompt) =====
    string private constant SOURCE = string(
    abi.encodePacked(
        "try {",
        "const SYSTEM=`SYSTEM PROMPT: You are a telehealth nurse deciding whether the patient needs an appointment. You can ask questions and give advice. After each response, remember to decide on whether they need an appointment. IF THEY NEED AN APPOINTMENT, SAY THIS KEY PHRASE: \" Based on our conversation, I recommend making an appointment.\" If they need no appointment, give them advice on what to do and what to keep an eye on. Keep response under 256 bytes.`;",
        "  const question = args[0] || \"\";",
        "  const prompt = SYSTEM + \"\\n\\nUser: \" + question + \"\\nAssistant:\";",
        "",
        "  const apiResponse = await Functions.makeHttpRequest({",
        "    url: \"https://api.openai.com/v1/chat/completions\",",
        "    method: \"POST\",",
        "    headers: {",
        "      \"Content-Type\": \"application/json\",",
        "      \"Authorization\": \"Bearer *API_KEY_HERE\"",
        "    },",
        "    data: {",
        "      model: \"gpt-3.5-turbo\",",
        "      messages: [{ role: \"user\", content: prompt }],",
        "      max_tokens: 150",
        "    }",
        "  });",
        "",
        "  let chatbotReply = \"No reply\";",
        "  if (apiResponse && apiResponse.data && apiResponse.data.choices && apiResponse.data.choices[0] && apiResponse.data.choices[0].message && apiResponse.data.choices[0].message.content) {",
        "    chatbotReply = String(apiResponse.data.choices[0].message.content).trim().slice(0, 256);",
        "  }",
        "",
        "  return Functions.encodeString(chatbotReply);",
        "} catch (e) {",
        "  return Functions.encodeString(`Error: ${String(e)}`);",
        "}"
    ));

    constructor() FunctionsClient(ROUTER) ConfirmedOwner(msg.sender) {}

    // ===== User entrypoint =====
    /// @notice Sends a request to ChatGPT through Chainlink Functions
    /// @param subscriptionId Your Functions billing subscription ID
    /// @param question A single question string (non-empty)
    function askQuestion(
        uint64 subscriptionId,
        string calldata question
    ) external returns (bytes32) {
        require(subscriptionId != 0, "Bad subId");
        require(bytes(question).length != 0, "Empty question");

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(SOURCE);

        string[] memory args = new string[](1);
        args[0] = question;
        req.setArgs(args);

        lastRequestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            CALLBACK_GAS_LIMIT,
            DON_ID
        );

        return lastRequestId;
    }

    // ===== DON callback =====
    /// @dev Do NOT revert here — failed callbacks are lost. Always record something readable.
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        if (lastRequestId != requestId) {
            lastError = abi.encodePacked("Mismatched requestId");
            emit Response(requestId, "", response, lastError);
            return;
        }

        lastResponse = response;
        lastError = err;

        // Instead of decoding, just store raw CBOR as a hex string
        if (response.length > 0) {
            lastAnswer = string(abi.encodePacked(response));
        } else {
            lastAnswer = "";
        }

        emit Response(requestId, lastAnswer, response, err);
    }


    /// @dev Helper used only for guarded decoding above
    function _decodeString(bytes memory data) public pure returns (string memory) {
        return abi.decode(data, (string));
    }

    /// @notice Returns the last error as a UTF-8 string
    function getLastError() external view returns (string memory) {
        return string(lastError);
    }
}

