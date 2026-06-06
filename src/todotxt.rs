use std::{
    env, fs,
    path::{Path, PathBuf},
};

use zed_extension_api::{
    self as zed, DownloadedFileType, LanguageServerId, LanguageServerInstallationStatus, Result,
};

const SERVER_REPOSITORY: &str = "khotyn/zed-todotxt";
const SERVER_RELEASE_TAG: &str = "v0.0.1";
const SERVER_ASSET_NAME: &str = "todotxt-lsp.mjs";
const SERVER_RELATIVE_PATH: &str = "server/todotxt-lsp.mjs";

struct TodoTxtExtension;

impl zed::Extension for TodoTxtExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        _worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        if language_server_id.as_ref() != "todotxt-lsp" {
            return Err(format!("unknown language server: {language_server_id}"));
        }

        let extension_dir = env::current_dir()
            .map_err(|_| "failed to get extension working directory".to_string())?;
        let server_path = install_language_server_script(&extension_dir, language_server_id)?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server_path.to_string_lossy().to_string()],
            env: Default::default(),
        })
    }
}

fn install_language_server_script(
    extension_dir: &Path,
    language_server_id: &LanguageServerId,
) -> Result<PathBuf> {
    let server_path = language_server_script_path(extension_dir);
    if server_path.exists() {
        return Ok(server_path);
    }

    fs::create_dir_all(
        server_path
            .parent()
            .ok_or_else(|| "failed to resolve language server directory".to_string())?,
    )
    .map_err(|error| format!("failed to create language server directory: {error}"))?;

    zed::set_language_server_installation_status(
        language_server_id,
        &LanguageServerInstallationStatus::Downloading,
    );

    let release = zed::github_release_by_tag_name(SERVER_REPOSITORY, SERVER_RELEASE_TAG)?;
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == SERVER_ASSET_NAME)
        .ok_or_else(|| {
            format!(
                "GitHub release {SERVER_RELEASE_TAG} for {SERVER_REPOSITORY} does not contain {SERVER_ASSET_NAME}"
            )
        })?;

    zed::download_file(
        &asset.download_url,
        SERVER_RELATIVE_PATH,
        DownloadedFileType::Uncompressed,
    )
    .map_err(|error| format!("failed to download language server: {error}"))?;

    zed::set_language_server_installation_status(
        language_server_id,
        &LanguageServerInstallationStatus::None,
    );

    Ok(server_path)
}

fn language_server_script_path(extension_dir: &Path) -> PathBuf {
    extension_dir.join(SERVER_RELATIVE_PATH)
}

zed::register_extension!(TodoTxtExtension);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_language_server_path_inside_extension_work_dir() {
        let dir =
            env::temp_dir().join(format!("zed-todotxt-extension-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);

        let server_path = language_server_script_path(&dir);

        assert!(server_path.ends_with("server/todotxt-lsp.mjs"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn manifest_and_language_config_cover_standard_todotxt_file_names() {
        let extension_manifest = include_str!("../extension.toml");
        let language_config = include_str!("../languages/todotxt/config.toml");

        assert!(extension_manifest.contains(r#"languages = ["Todo.txt"]"#));
        assert!(extension_manifest.contains(r#"language_ids = { "Todo.txt" = "todotxt" }"#));
        assert!(extension_manifest.contains("https://github.com/khotyn/tree-sitter-todotxt"));
        assert!(!extension_manifest.contains("file://"));

        for suffix in [r#""todotxt""#, r#""todo.txt""#, r#""done.txt""#] {
            assert!(
                language_config.contains(suffix),
                "missing path suffix {suffix}"
            );
        }
    }

    #[test]
    fn language_server_is_distributed_as_a_release_asset() {
        assert_eq!(SERVER_REPOSITORY, "khotyn/zed-todotxt");
        assert_eq!(SERVER_RELEASE_TAG, "v0.0.1");
        assert_eq!(SERVER_ASSET_NAME, "todotxt-lsp.mjs");
        assert_eq!(SERVER_RELATIVE_PATH, "server/todotxt-lsp.mjs");
    }
}
