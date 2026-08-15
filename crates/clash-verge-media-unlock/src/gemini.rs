use std::error::Error as _;

use clash_verge_logging::{Type, logging};
use reqwest::Client;

use super::{UnlockItem, UnlockService};

const BLOCKED_CODES: [&str; 7] = ["CHN", "RUS", "BLR", "CUB", "IRN", "PRK", "SYR"];
const REGION_MARKER: &str = ",2,1,200,\"";

fn error_chain(error: &reqwest::Error) -> String {
    let mut messages = vec![error.to_string()];
    let mut source = error.source();

    while let Some(error) = source {
        let message = error.to_string();
        if !messages.contains(&message) {
            messages.push(message);
        }
        source = error.source();
    }

    messages.join(": ")
}

fn is_http2_protocol_error(error: &reqwest::Error) -> bool {
    let detail = error_chain(error).to_ascii_lowercase();
    (detail.contains("http2") || detail.contains("http/2"))
        && (detail.contains("protocol error") || detail.contains("protocol_error"))
}

async fn get_gemini(client: &Client) -> Result<reqwest::Response, reqwest::Error> {
    client.get("https://gemini.google.com").send().await
}

pub(super) async fn check_gemini(client: &Client, http1_client: &Client) -> UnlockItem {
    let url = "https://gemini.google.com";

    let response = match get_gemini(client).await {
        Ok(r) => r,
        Err(http2_error) if is_http2_protocol_error(&http2_error) => {
            logging!(
                warn,
                Type::Network,
                "Gemini HTTP/2 request failed with a protocol error; retrying with HTTP/1.1: {}",
                error_chain(&http2_error)
            );
            match get_gemini(http1_client).await {
                Ok(response) => response,
                Err(http1_error) => {
                    logging!(
                        error,
                        Type::Network,
                        "Gemini HTTP/1.1 fallback failed after HTTP/2 protocol error: {}",
                        error_chain(&http1_error)
                    );
                    return UnlockItem::checked(
                        UnlockService::Gemini,
                        "Failed (HTTP/2 protocol error; HTTP/1.1 network error)",
                        None,
                    );
                }
            }
        }
        Err(error) => {
            logging!(error, Type::Network, "Gemini request failed: {}", error_chain(&error));
            return UnlockItem::checked(UnlockService::Gemini, "Failed (Network Connection)", None);
        }
    };

    let status = response.status();
    if !status.is_success() {
        logging!(error, Type::Network, "Gemini returned HTTP status {status} for {url}");
        return UnlockItem::checked(UnlockService::Gemini, format!("Failed (HTTP {status})"), None);
    }

    let body = match response.text().await {
        Ok(b) => b,
        Err(error) => {
            logging!(error, Type::Network, "Failed to read Gemini response body: {error}");
            return UnlockItem::checked(UnlockService::Gemini, "Failed (Cannot read response)", None);
        }
    };

    let country_code = body
        .find(REGION_MARKER)
        .and_then(|i| {
            let start = i + REGION_MARKER.len();
            body.get(start..start + 3)
        })
        .filter(|s| s.bytes().all(|b| b.is_ascii_uppercase()));

    match country_code {
        Some(code) => {
            let status = if BLOCKED_CODES.contains(&code) { "No" } else { "Yes" };
            UnlockItem::checked_region(UnlockService::Gemini, status, code)
        }
        None => {
            logging!(
                error,
                Type::Network,
                "Gemini response did not contain the expected region marker; HTTP status was {status}"
            );
            UnlockItem::checked(UnlockService::Gemini, "Failed (Region parse error)", None)
        }
    }
}
