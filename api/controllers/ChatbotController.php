<?php
/* ==========================================================================
   SPENDMINDAI - CHATBOT CONTROLLER
   Gemini API LLM AI Financial Advisor integration
   ========================================================================== */

class ChatbotController {

    /**
     * Return configured Gemini API Key from environment variables.
     */
    public function getGeminiKey(): void {
        $geminiApiKey = function_exists('getEnvVar') ? getEnvVar('GEMINI_API_KEY') : getenv('GEMINI_API_KEY');

        echo json_encode([
            "success" => !empty($geminiApiKey),
            "key" => $geminiApiKey ?: '',
            "message" => empty($geminiApiKey) ? "GEMINI_API_KEY chưa được cấu hình trong biến môi trường" : ""
        ]);
        exit();
    }
}
