pub use clash_verge_media_unlock::{UnlockItem, UnlockService};
use tauri::command;

use crate::{
    cmd::{CmdResult, StringifyErr as _},
    config::MediaUnlockProxy,
};

#[command]
pub async fn get_unlock_items() -> CmdResult<Vec<UnlockItem>> {
    Ok(clash_verge_media_unlock::default_unlock_items())
}

#[command]
pub async fn check_media_unlock() -> CmdResult<Vec<UnlockItem>> {
    let proxy_url = MediaUnlockProxy::url().await.stringify_err()?;
    clash_verge_media_unlock::check_media_unlock_with_proxy(Some(&proxy_url))
        .await
        .stringify_err()
}

#[command]
pub async fn check_media_unlock_item(service: UnlockService) -> CmdResult<UnlockItem> {
    let proxy_url = MediaUnlockProxy::url().await.stringify_err()?;
    clash_verge_media_unlock::check_media_unlock_service_with_proxy(service, Some(&proxy_url))
        .await
        .stringify_err()
}
