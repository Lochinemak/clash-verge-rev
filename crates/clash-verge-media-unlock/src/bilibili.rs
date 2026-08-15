use clash_verge_logging::{Type, logging};
use reqwest::Client;
use serde_json::Value;

use super::{UnlockItem, UnlockService};

pub(super) async fn check_bilibili_china_mainland(client: &Client) -> UnlockItem {
    let url = "https://api.bilibili.com/pgc/player/web/playurl?avid=82846771&qn=0&type=&otype=json&ep_id=307247&fourk=1&fnver=0&fnval=16&module=bangumi";

    match client.get(url).send().await {
        Ok(response) => match response.json::<Value>().await {
            Ok(body) => {
                let status = body
                    .get("code")
                    .and_then(|v| v.as_i64())
                    .map(|code| {
                        if code == 0 {
                            "Yes"
                        } else if code == -10403 {
                            "No"
                        } else {
                            "Failed"
                        }
                    })
                    .unwrap_or("Failed");

                UnlockItem::checked(UnlockService::BilibiliChinaMainland, status, None)
            }
            Err(_) => UnlockItem::checked(UnlockService::BilibiliChinaMainland, "Failed", None),
        },
        Err(_) => UnlockItem::checked(UnlockService::BilibiliChinaMainland, "Failed", None),
    }
}

pub(super) async fn check_bilibili_hk_mc_tw(client: &Client) -> UnlockItem {
    // 2025 title: 這公司有我喜歡的人（僅限港澳台地區）.
    // The previous ep_id=183799 sample has been removed and now reports misleading region errors.
    let url = "https://api.bilibili.com/pgc/player/web/playurl?avid=113779153045469&cid=27724744183&qn=0&type=&otype=json&ep_id=1348349&fourk=1&fnver=0&fnval=16&module=bangumi";

    match client.get(url).send().await {
        Ok(response) => {
            let http_status = response.status();
            if !http_status.is_success() {
                logging!(
                    error,
                    Type::Network,
                    "Bilibili HK/MO/TW returned HTTP status {http_status}"
                );
                return UnlockItem::checked(
                    UnlockService::BilibiliHkMcTw,
                    format!("Failed (HTTP {http_status})"),
                    None,
                );
            }

            match response.json::<Value>().await {
                Ok(body) => {
                    let status = match body.get("code").and_then(|v| v.as_i64()) {
                        Some(0) => "Yes".to_string(),
                        Some(-10403) => "No".to_string(),
                        Some(code) => {
                            logging!(
                                error,
                                Type::Network,
                                "Bilibili HK/MO/TW returned unexpected API code {code}"
                            );
                            format!("Failed (API code {code})")
                        }
                        None => {
                            logging!(
                                error,
                                Type::Network,
                                "Bilibili HK/MO/TW response did not contain a numeric code"
                            );
                            "Failed (Invalid response)".to_string()
                        }
                    };

                    UnlockItem::checked(UnlockService::BilibiliHkMcTw, status, None)
                }
                Err(error) => {
                    logging!(
                        error,
                        Type::Network,
                        "Failed to parse Bilibili HK/MO/TW response: {error}"
                    );
                    UnlockItem::checked(UnlockService::BilibiliHkMcTw, "Failed (Invalid response)", None)
                }
            }
        }
        Err(error) => {
            logging!(error, Type::Network, "Bilibili HK/MO/TW request failed: {error}");
            UnlockItem::checked(UnlockService::BilibiliHkMcTw, "Failed (Network Connection)", None)
        }
    }
}
