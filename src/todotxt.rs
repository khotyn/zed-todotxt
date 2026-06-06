use std::{
    env, fs,
    path::{Path, PathBuf},
};

use zed_extension_api::{self as zed, LanguageServerId, Result};

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

        let extension_dir =
            env::current_dir().map_err(|_| "failed to get extension working directory".to_string())?;
        let server_path = write_language_server_script(&extension_dir)?;

        Ok(zed::Command {
            command: zed::node_binary_path()?,
            args: vec![server_path.to_string_lossy().to_string()],
            env: Default::default(),
        })
    }
}

fn write_language_server_script(extension_dir: &Path) -> Result<PathBuf> {
    let server_dir = extension_dir.join("server");
    let server_path = server_dir.join("todotxt-lsp.mjs");

    fs::create_dir_all(&server_dir)
        .map_err(|error| format!("failed to create language server directory: {error}"))?;
    fs::write(&server_path, include_str!("../server/todotxt-lsp.mjs"))
        .map_err(|error| format!("failed to write language server script: {error}"))?;

    Ok(server_path)
}

zed::register_extension!(TodoTxtExtension);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_embedded_language_server_into_empty_work_dir() {
        let dir = env::temp_dir().join(format!(
            "zed-todotxt-extension-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);

        let server_path = write_language_server_script(&dir).unwrap();
        let server = fs::read_to_string(&server_path).unwrap();

        assert!(server_path.ends_with("server/todotxt-lsp.mjs"));
        assert!(server.contains("documentChanges"));
        assert!(server.contains("semanticTokensProvider"));
        assert!(server.contains("completedTask"));

        fs::remove_dir_all(&dir).unwrap();
    }
}
