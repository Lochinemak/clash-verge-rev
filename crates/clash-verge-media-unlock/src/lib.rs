use std::{future::Future, sync::Arc, time::Duration};

use reqwest::{Client, ClientBuilder, Proxy};
use tokio::task::JoinSet;

use clash_verge_logging::{Type, logging};

mod bahamut;
mod bilibili;
mod chatgpt;
mod claude;
mod disney_plus;
mod gemini;
mod netflix;
mod prime_video;
mod spotify;
mod tiktok;
mod types;
mod utils;
mod youtube;

pub use types::{UnlockItem, UnlockService, default_unlock_items};

use bahamut::check_bahamut_anime;
use bilibili::{check_bilibili_china_mainland, check_bilibili_hk_mc_tw};
use chatgpt::check_chatgpt_combined;
use claude::check_claude;
use disney_plus::check_disney_plus;
use gemini::check_gemini;
use netflix::check_netflix;
use prime_video::check_prime_video;
use spotify::check_spotify;
use tiktok::check_tiktok;
use youtube::check_youtube_premium;

type UnlockResults = Vec<UnlockItem>;
const UNLOCK_CHECK_TIMEOUT: Duration = Duration::from_secs(30);

fn spawn_unlock_check<F, Fut>(tasks: &mut JoinSet<UnlockResults>, client: Arc<Client>, check: F)
where
    F: FnOnce(Arc<Client>) -> Fut + Send + 'static,
    Fut: Future<Output = UnlockResults> + Send + 'static,
{
    tasks.spawn(async move { check(client).await });
}

fn single_result(item: UnlockItem) -> UnlockResults {
    vec![item]
}

async fn check_unlock_service(
    service: UnlockService,
    client: &Client,
    gemini_http1_client: Option<&Client>,
) -> UnlockItem {
    let check = async {
        match service {
            UnlockService::BilibiliChinaMainland => check_bilibili_china_mainland(client).await,
            UnlockService::BilibiliHkMcTw => check_bilibili_hk_mc_tw(client).await,
            UnlockService::ChatgptIos | UnlockService::ChatgptWeb => check_chatgpt_combined(client)
                .await
                .into_iter()
                .find(|item| item.service == service)
                .unwrap_or_else(|| UnlockItem::checked(service, "Failed", None)),
            UnlockService::Claude => check_claude(client).await,
            UnlockService::Gemini => match gemini_http1_client {
                Some(http1_client) => check_gemini(client, http1_client).await,
                None => UnlockItem::checked(service, "Failed (HTTP/1.1 client unavailable)", None),
            },
            UnlockService::YoutubePremium => check_youtube_premium(client).await,
            UnlockService::BahamutAnime => check_bahamut_anime(client).await,
            UnlockService::Netflix => check_netflix(client).await,
            UnlockService::DisneyPlus => check_disney_plus(client).await,
            UnlockService::PrimeVideo => check_prime_video(client).await,
            UnlockService::Spotify => check_spotify(client).await,
            UnlockService::Tiktok => check_tiktok(client).await,
        }
    };

    match tokio::time::timeout(UNLOCK_CHECK_TIMEOUT, check).await {
        Ok(item) => item,
        Err(_) => {
            logging!(warn, Type::Network, "{} unlock check timed out", service.name());
            UnlockItem::checked(service, "Failed (Timeout)", None)
        }
    }
}

pub async fn check_media_unlock() -> Result<Vec<UnlockItem>, String> {
    check_media_unlock_with_proxy(None).await
}

fn unlock_client_builder(proxy_url: Option<&str>) -> Result<ClientBuilder, String> {
    let mut builder = Client::builder()
        .use_rustls_tls()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(30))
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .tcp_keepalive(std::time::Duration::from_secs(60))
        .connection_verbose(true);

    if let Some(proxy_url) = proxy_url {
        let proxy = Proxy::all(proxy_url).map_err(|e| format!("创建解锁测试代理失败: {e}"))?;
        builder = builder.proxy(proxy);
    }

    Ok(builder)
}

fn build_unlock_client(proxy_url: Option<&str>, http1_only: bool) -> Result<Client, String> {
    let mut builder = unlock_client_builder(proxy_url)?;
    if http1_only {
        builder = builder.http1_only();
    }
    builder.build().map_err(|e| format!("创建HTTP客户端失败: {e}"))
}

pub async fn check_media_unlock_service_with_proxy(
    service: UnlockService,
    proxy_url: Option<&str>,
) -> Result<UnlockItem, String> {
    let client = build_unlock_client(proxy_url, false)?;
    let gemini_http1_client = if service == UnlockService::Gemini {
        Some(build_unlock_client(proxy_url, true)?)
    } else {
        None
    };

    Ok(check_unlock_service(service, &client, gemini_http1_client.as_ref()).await)
}

pub async fn check_media_unlock_with_proxy(proxy_url: Option<&str>) -> Result<Vec<UnlockItem>, String> {
    let client = build_unlock_client(proxy_url, false)?;
    let gemini_http1_client =
        build_unlock_client(proxy_url, true).map_err(|e| format!("创建 Gemini HTTP/1.1 回退客户端失败: {e}"))?;

    let mut tasks = JoinSet::new();
    let client_arc = Arc::new(client);
    let gemini_http1_client = Arc::new(gemini_http1_client);

    let single_services = [
        UnlockService::BilibiliChinaMainland,
        UnlockService::BilibiliHkMcTw,
        UnlockService::Claude,
        UnlockService::Gemini,
        UnlockService::YoutubePremium,
        UnlockService::BahamutAnime,
        UnlockService::Netflix,
        UnlockService::DisneyPlus,
        UnlockService::Spotify,
        UnlockService::Tiktok,
        UnlockService::PrimeVideo,
    ];
    for service in single_services {
        let client = Arc::clone(&client_arc);
        let http1_client = Arc::clone(&gemini_http1_client);
        tasks.spawn(async move { single_result(check_unlock_service(service, &client, Some(&http1_client)).await) });
    }
    spawn_unlock_check(&mut tasks, Arc::clone(&client_arc), |client| async move {
        match tokio::time::timeout(UNLOCK_CHECK_TIMEOUT, check_chatgpt_combined(&client)).await {
            Ok(items) => items,
            Err(_) => vec![
                UnlockItem::checked(UnlockService::ChatgptIos, "Failed (Timeout)", None),
                UnlockItem::checked(UnlockService::ChatgptWeb, "Failed (Timeout)", None),
            ],
        }
    });

    let mut results = Vec::new();
    while let Some(res) = tasks.join_next().await {
        match res {
            Ok(items) => results.extend(items),
            Err(e) => logging!(error, Type::Network, "任务执行失败: {e}"),
        }
    }

    Ok(results)
}
