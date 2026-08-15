use serde::{Deserialize, Serialize};

use super::utils::{country_code_to_emoji, get_local_date_string};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UnlockService {
    BilibiliChinaMainland,
    BilibiliHkMcTw,
    ChatgptIos,
    ChatgptWeb,
    Claude,
    Gemini,
    YoutubePremium,
    BahamutAnime,
    Netflix,
    DisneyPlus,
    PrimeVideo,
    Spotify,
    Tiktok,
}

impl UnlockService {
    pub const fn name(self) -> &'static str {
        match self {
            Self::BilibiliChinaMainland => "哔哩哔哩大陆",
            Self::BilibiliHkMcTw => "哔哩哔哩港澳台",
            Self::ChatgptIos => "ChatGPT iOS",
            Self::ChatgptWeb => "ChatGPT Web",
            Self::Claude => "Claude",
            Self::Gemini => "Gemini",
            Self::YoutubePremium => "YouTube Premium",
            Self::BahamutAnime => "Bahamut Anime",
            Self::Netflix => "Netflix",
            Self::DisneyPlus => "Disney+",
            Self::PrimeVideo => "Prime Video",
            Self::Spotify => "Spotify",
            Self::Tiktok => "TikTok",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnlockItem {
    pub service: UnlockService,
    pub name: String,
    pub status: String,
    pub region: Option<String>,
    pub check_time: Option<String>,
}

impl UnlockItem {
    pub fn checked(service: UnlockService, status: impl Into<String>, region: Option<String>) -> Self {
        Self {
            service,
            name: service.name().to_string(),
            status: status.into(),
            region,
            check_time: Some(get_local_date_string()),
        }
    }

    pub fn checked_region(service: UnlockService, status: impl Into<String>, country_code: &str) -> Self {
        Self::checked(service, status, Some(Self::region_label(country_code)))
    }

    pub fn region_label(country_code: &str) -> String {
        let emoji = country_code_to_emoji(country_code);
        format!("{emoji}{country_code}")
    }

    pub fn pending(service: UnlockService) -> Self {
        Self {
            service,
            name: service.name().to_string(),
            status: "Pending".to_string(),
            region: None,
            check_time: None,
        }
    }
}

const DEFAULT_UNLOCK_SERVICES: [UnlockService; 13] = [
    UnlockService::BilibiliChinaMainland,
    UnlockService::BilibiliHkMcTw,
    UnlockService::ChatgptIos,
    UnlockService::ChatgptWeb,
    UnlockService::Claude,
    UnlockService::Gemini,
    UnlockService::YoutubePremium,
    UnlockService::BahamutAnime,
    UnlockService::Netflix,
    UnlockService::DisneyPlus,
    UnlockService::PrimeVideo,
    UnlockService::Spotify,
    UnlockService::Tiktok,
];

pub fn default_unlock_items() -> Vec<UnlockItem> {
    DEFAULT_UNLOCK_SERVICES
        .iter()
        .copied()
        .map(UnlockItem::pending)
        .collect()
}
