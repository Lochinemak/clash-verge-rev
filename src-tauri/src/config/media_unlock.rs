use super::Config;
use crate::{
    core::listener::{ListenerProbe, ListenerProbeOutcome, ListenerTransport, probe_listener},
    utils::port::find_next_available_port,
};
use anyhow::{Context as _, Result, anyhow};
use serde_yaml_ng::{Mapping, Value};
use std::{collections::HashSet, net::SocketAddr, str::FromStr as _};

pub(crate) const MEDIA_UNLOCK_LISTENER_NAME: &str = "clash-verge-media-unlock";

pub struct MediaUnlockProxy;

impl MediaUnlockProxy {
    pub(crate) fn inject(config: &mut Mapping, previous: Option<&Mapping>) -> Result<()> {
        remove_managed_listener(config)?;

        let Some(proxy) = primary_proxy_group(config) else {
            return Ok(());
        };
        let reserved = configured_ports(config);
        let port = previous
            .and_then(managed_listener_port)
            .filter(|port| !reserved.contains(port))
            .map(Ok)
            .unwrap_or_else(|| allocate_listener_port(config, &reserved))?;

        let mut listener = Mapping::new();
        listener.insert("name".into(), MEDIA_UNLOCK_LISTENER_NAME.into());
        listener.insert("type".into(), "mixed".into());
        listener.insert("listen".into(), "127.0.0.1".into());
        listener.insert("port".into(), port.into());
        listener.insert("users".into(), Value::Sequence(Vec::new()));
        listener.insert("proxy".into(), proxy.into());

        let listeners = config
            .entry("listeners".into())
            .or_insert_with(|| Value::Sequence(Vec::new()))
            .as_sequence_mut()
            .context("listeners must be a sequence")?;
        listeners.push(Value::Mapping(listener));
        Ok(())
    }

    pub async fn url() -> Result<String> {
        let runtime = Config::runtime().await.latest_arc();
        let config = runtime
            .config
            .as_ref()
            .context("media unlock proxy is unavailable because runtime configuration is missing")?;
        let port = managed_listener_port(config)
            .context("media unlock proxy is unavailable because no selectable proxy group exists")?;
        Ok(format!("http://127.0.0.1:{port}"))
    }
}

fn remove_managed_listener(config: &mut Mapping) -> Result<()> {
    let Some(listeners) = config.get_mut("listeners") else {
        return Ok(());
    };
    let listeners = listeners.as_sequence_mut().context("listeners must be a sequence")?;
    listeners.retain(|listener| listener.get("name").and_then(Value::as_str) != Some(MEDIA_UNLOCK_LISTENER_NAME));
    Ok(())
}

fn primary_proxy_group(config: &Mapping) -> Option<&str> {
    let groups = config.get("proxy-groups")?.as_sequence()?;
    groups
        .iter()
        .filter_map(Value::as_mapping)
        .filter(|group| group.get("name").and_then(Value::as_str) != Some("GLOBAL"))
        .find(|group| group.get("type").and_then(Value::as_str) == Some("select"))
        .or_else(|| {
            groups
                .iter()
                .filter_map(Value::as_mapping)
                .find(|group| group.get("name").and_then(Value::as_str) != Some("GLOBAL"))
        })
        .and_then(|group| group.get("name"))
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
}

fn managed_listener_port(config: &Mapping) -> Option<u16> {
    config
        .get("listeners")?
        .as_sequence()?
        .iter()
        .find(|listener| listener.get("name").and_then(Value::as_str) == Some(MEDIA_UNLOCK_LISTENER_NAME))?
        .get("port")
        .and_then(value_as_port)
}

fn allocate_listener_port(config: &Mapping, reserved: &HashSet<u16>) -> Result<u16> {
    let mixed_port = config
        .get("mixed-port")
        .and_then(value_as_port)
        .ok_or_else(|| anyhow!("mixed-port is missing while allocating the media unlock listener"))?;
    find_next_available_port(mixed_port, reserved, |port| {
        matches!(
            probe_listener(&ListenerProbe {
                address: format!("127.0.0.1:{port}"),
                transports: vec![ListenerTransport::Tcp, ListenerTransport::Udp],
            }),
            ListenerProbeOutcome::Available
        )
    })
    .ok_or_else(|| anyhow!("no loopback port is available for the media unlock listener"))
}

fn configured_ports(config: &Mapping) -> HashSet<u16> {
    let mut ports = ["mixed-port", "socks-port", "port", "redir-port", "tproxy-port"]
        .into_iter()
        .filter_map(|key| config.get(key).and_then(value_as_port))
        .collect::<HashSet<_>>();

    if let Some(port) = config
        .get("external-controller")
        .and_then(Value::as_str)
        .and_then(|address| SocketAddr::from_str(address).ok())
        .map(|address| address.port())
    {
        ports.insert(port);
    }

    if let Some(listeners) = config.get("listeners").and_then(Value::as_sequence) {
        ports.extend(
            listeners
                .iter()
                .filter(|listener| listener.get("name").and_then(Value::as_str) != Some(MEDIA_UNLOCK_LISTENER_NAME))
                .filter_map(|listener| listener.get("port"))
                .filter_map(value_as_port),
        );
    }
    ports
}

fn value_as_port(value: &Value) -> Option<u16> {
    match value {
        Value::Number(port) => port.as_u64().and_then(|port| u16::try_from(port).ok()),
        Value::String(port) => port.parse().ok(),
        _ => None,
    }
    .filter(|port| *port != 0)
}
