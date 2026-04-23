use anyhow::{anyhow, bail, Context, Result};
use flate2::read::GzDecoder;
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tar::Archive;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const ECT_RELEASE_API_URL: &str =
    "https://api.github.com/repos/gaon12/Efficient-Compression-Tool/releases/latest";
const USER_AGENT: &str = "stardust-document-compressor/0.1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum OutputMode {
    Suffix,
    Folder,
    NewFolder,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompressionRequest {
    path: String,
    output_mode: OutputMode,
    output_suffix: String,
    specific_output_path: String,
    new_folder_name: String,
    keep_original: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressionResponse {
    output_path: Option<String>,
    original_bytes: u64,
    compressed_bytes: u64,
    saved_bytes: u64,
    discarded: bool,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    digest: Option<String>,
}

#[tauri::command]
fn compress_document(request: CompressionRequest) -> Result<CompressionResponse, String> {
    compress_document_impl(request).map_err(map_command_error)
}

fn compress_document_impl(request: CompressionRequest) -> Result<CompressionResponse> {
    let source_path = PathBuf::from(request.path.trim());
    if request.path.trim().is_empty() || !source_path.exists() || !source_path.is_file() {
        bail!("파일을 찾을 수 없습니다.");
    }

    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if !is_supported_extension(&extension) {
        bail!("지원하지 않는 파일 형식입니다.");
    }

    let original_bytes = fs::metadata(&source_path)
        .with_context(|| format!("원본 파일 크기 확인 실패: {}", source_path.display()))?
        .len();

    let output_path = build_output_path(&source_path, &request)?;
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("출력 폴더를 만들 수 없습니다: {}", parent.display()))?;
    }

    fs::copy(&source_path, &output_path).with_context(|| {
        format!(
            "압축 처리용 파일 복사 실패: {} -> {}",
            source_path.display(),
            output_path.display()
        )
    })?;

    if is_xml_container_extension(&extension) {
        minify_xml_entries_in_zip(&output_path)?;
    }

    let ect_binary_path = ensure_ect_installed()?;
    run_ect(&ect_binary_path, &output_path)?;

    let compressed_bytes = fs::metadata(&output_path)
        .with_context(|| format!("압축 결과 파일 크기 확인 실패: {}", output_path.display()))?
        .len();

    if compressed_bytes >= original_bytes {
        let _ = fs::remove_file(&output_path);
        return Ok(CompressionResponse {
            output_path: None,
            original_bytes,
            compressed_bytes: original_bytes,
            saved_bytes: 0,
            discarded: true,
        });
    }

    if !request.keep_original && source_path != output_path {
        fs::remove_file(&source_path)
            .with_context(|| format!("원본 파일 삭제 실패: {}", source_path.display()))?;
    }

    Ok(CompressionResponse {
        output_path: Some(output_path.to_string_lossy().to_string()),
        original_bytes,
        compressed_bytes,
        saved_bytes: original_bytes.saturating_sub(compressed_bytes),
        discarded: false,
    })
}

fn is_supported_extension(extension: &str) -> bool {
    matches!(
        extension,
        "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odf" | "odt" | "odp" | "ods" | "pdf"
    )
}

fn is_xml_container_extension(extension: &str) -> bool {
    matches!(
        extension,
        "docx" | "xlsx" | "pptx" | "odf" | "odt" | "odp" | "ods"
    )
}

fn build_output_path(source_path: &Path, request: &CompressionRequest) -> Result<PathBuf> {
    let parent = source_path
        .parent()
        .ok_or_else(|| anyhow!("원본 파일 폴더를 확인할 수 없습니다."))?;
    let file_name = source_path
        .file_name()
        .ok_or_else(|| anyhow!("원본 파일명을 확인할 수 없습니다."))?;

    let mut output_path = match request.output_mode {
        OutputMode::Suffix => {
            let stem = source_path
                .file_stem()
                .and_then(|value| value.to_str())
                .ok_or_else(|| anyhow!("원본 파일명을 처리할 수 없습니다."))?;
            let extension = source_path.extension().and_then(|value| value.to_str());
            let suffix = if request.output_suffix.trim().is_empty() {
                "_compressed"
            } else {
                request.output_suffix.trim()
            };

            let output_name = match extension {
                Some(ext) if !ext.is_empty() => format!("{}{}.{}", stem, suffix, ext),
                _ => format!("{}{}", stem, suffix),
            };
            parent.join(output_name)
        }
        OutputMode::Folder => {
            let output_folder = request.specific_output_path.trim();
            if output_folder.is_empty() {
                bail!("출력 폴더가 비어 있습니다.");
            }
            PathBuf::from(output_folder).join(file_name)
        }
        OutputMode::NewFolder => {
            let folder_name = if request.new_folder_name.trim().is_empty() {
                "compressed_result"
            } else {
                request.new_folder_name.trim()
            };
            parent.join(folder_name).join(file_name)
        }
    };

    if output_path == source_path {
        let stem = source_path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("원본 파일명을 처리할 수 없습니다."))?;
        let extension = source_path.extension().and_then(|value| value.to_str());
        let fallback_name = match extension {
            Some(ext) if !ext.is_empty() => format!("{}_compressed.{}", stem, ext),
            _ => format!("{}_compressed", stem),
        };
        output_path = parent.join(fallback_name);
    }

    Ok(output_path)
}

fn minify_xml_entries_in_zip(path: &Path) -> Result<()> {
    let input_file =
        File::open(path).with_context(|| format!("압축 파일 열기 실패: {}", path.display()))?;
    let mut archive = ZipArchive::new(input_file)
        .with_context(|| format!("ZIP 구조 읽기 실패: {}", path.display()))?;

    let temp_path = path.with_extension("tmpzip");
    let output_file = File::create(&temp_path)
        .with_context(|| format!("임시 ZIP 생성 실패: {}", temp_path.display()))?;
    let mut writer = ZipWriter::new(output_file);

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let entry_name = entry.name().to_string();
        let mut options =
            SimpleFileOptions::default().compression_method(match entry.compression() {
                CompressionMethod::Stored => CompressionMethod::Deflated,
                other => other,
            });

        if let Some(mode) = entry.unix_mode() {
            options = options.unix_permissions(mode);
        }

        if entry.is_dir() {
            writer.add_directory(entry_name, options)?;
            continue;
        }

        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;

        if is_xml_entry(&entry_name) {
            if let Ok(text) = std::str::from_utf8(&data) {
                data = minify_xml_content(text).into_bytes();
            }
        }

        writer.start_file(entry_name, options)?;
        writer.write_all(&data)?;
    }

    writer.finish()?;
    let _ = fs::remove_file(path);
    fs::rename(&temp_path, path).with_context(|| {
        format!(
            "XML 최소화 결과 반영 실패: {} -> {}",
            temp_path.display(),
            path.display()
        )
    })?;

    Ok(())
}

fn is_xml_entry(entry_name: &str) -> bool {
    let lowered = entry_name.to_ascii_lowercase();
    lowered.ends_with(".xml") || lowered.ends_with(".rels")
}

fn minify_xml_content(content: &str) -> String {
    let between_tags = Regex::new(r">\s+<").expect("valid regex");
    between_tags.replace_all(content.trim(), "><").to_string()
}

fn run_ect(binary_path: &Path, target_path: &Path) -> Result<()> {
    let status = Command::new(binary_path)
        .arg("-9")
        .arg("-quiet")
        .arg(target_path)
        .status()
        .with_context(|| {
            format!(
                "ECT 실행 실패: {} {}",
                binary_path.display(),
                target_path.display()
            )
        })?;

    if !status.success() {
        bail!("ECT 압축 처리에 실패했습니다.");
    }

    Ok(())
}

fn ensure_ect_installed() -> Result<PathBuf> {
    let install_dir = ect_install_dir();
    fs::create_dir_all(&install_dir)
        .with_context(|| format!("ECT 설치 폴더 생성 실패: {}", install_dir.display()))?;

    let binary_name = ect_binary_name();
    let binary_path = install_dir.join(binary_name);
    if binary_path.exists() {
        return Ok(binary_path);
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .context("HTTP 클라이언트 생성 실패")?;

    let release = fetch_latest_release(&client)?;
    let target_suffix = target_asset_suffix()?;
    let archive_asset = release
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(target_suffix))
        .cloned()
        .ok_or_else(|| anyhow!("현재 시스템에 맞는 ECT 바이너리를 찾을 수 없습니다."))?;

    let archive_path = install_dir.join(&archive_asset.name);
    download_file(&client, &archive_asset.browser_download_url, &archive_path)?;
    verify_archive_checksum(&client, &release.assets, &archive_asset, &archive_path)?;
    extract_ect_binary(&archive_path, &binary_path)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&binary_path, permissions)?;
    }

    let _ = fs::remove_file(&archive_path);

    if !binary_path.exists() {
        bail!("ECT 실행 파일을 설치하지 못했습니다.");
    }

    Ok(binary_path)
}

fn ect_install_dir() -> PathBuf {
    if let Some(base_dir) = dirs::data_local_dir() {
        return base_dir.join("stardust").join("tools").join("ect");
    }

    std::env::temp_dir()
        .join("stardust")
        .join("tools")
        .join("ect")
}

fn ect_binary_name() -> &'static str {
    if cfg!(windows) {
        "ect.exe"
    } else {
        "ect"
    }
}

fn target_asset_suffix() -> Result<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => Ok("windows_amd64.zip"),
        ("windows", "aarch64") => Ok("windows_arm64.zip"),
        ("linux", "x86_64") => Ok("linux_amd64.tar.gz"),
        ("linux", "aarch64") => Ok("linux_arm64.tar.gz"),
        ("macos", "x86_64") => Ok("darwin_amd64.tar.gz"),
        ("macos", "aarch64") => Ok("darwin_arm64.tar.gz"),
        (os, arch) => bail!("지원하지 않는 시스템입니다: {os}/{arch}"),
    }
}

fn fetch_latest_release(client: &Client) -> Result<GithubRelease> {
    client
        .get(ECT_RELEASE_API_URL)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .context("ECT 릴리스 정보를 가져오지 못했습니다.")?
        .error_for_status()
        .context("ECT 릴리스 API 응답이 올바르지 않습니다.")?
        .json::<GithubRelease>()
        .context("ECT 릴리스 정보를 해석하지 못했습니다.")
}

fn download_file(client: &Client, url: &str, destination: &Path) -> Result<()> {
    let bytes = client
        .get(url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .with_context(|| format!("다운로드 실패: {url}"))?
        .error_for_status()
        .with_context(|| format!("다운로드 응답 오류: {url}"))?
        .bytes()
        .with_context(|| format!("다운로드 데이터 읽기 실패: {url}"))?;

    fs::write(destination, &bytes)
        .with_context(|| format!("다운로드 파일 저장 실패: {}", destination.display()))
}

fn verify_archive_checksum(
    client: &Client,
    assets: &[GithubAsset],
    archive_asset: &GithubAsset,
    archive_path: &Path,
) -> Result<()> {
    let expected = if let Some(digest) = archive_asset.digest.clone() {
        normalize_sha256_digest(&digest)
    } else {
        let checksums_asset = assets
            .iter()
            .find(|asset| asset.name == "checksums.txt")
            .ok_or_else(|| anyhow!("체크섬 파일을 찾을 수 없습니다."))?;
        let body = client
            .get(&checksums_asset.browser_download_url)
            .header(reqwest::header::USER_AGENT, USER_AGENT)
            .send()
            .context("체크섬 파일 다운로드 실패")?
            .error_for_status()
            .context("체크섬 파일 응답 오류")?
            .text()
            .context("체크섬 파일 읽기 실패")?;

        parse_checksum_from_text(&body, &archive_asset.name)
            .ok_or_else(|| anyhow!("해당 바이너리의 체크섬을 찾을 수 없습니다."))?
    };

    let actual = sha256_file(archive_path)?;
    if actual != expected {
        bail!("다운로드 파일 무결성 검증에 실패했습니다.");
    }

    Ok(())
}

fn normalize_sha256_digest(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("sha256:")
        .to_ascii_lowercase()
}

fn parse_checksum_from_text(body: &str, file_name: &str) -> Option<String> {
    body.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?;
        if name == file_name {
            Some(hash.to_ascii_lowercase())
        } else {
            None
        }
    })
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = File::open(path)
        .with_context(|| format!("체크섬 계산 대상 파일 열기 실패: {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];

    loop {
        let size = file.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        hasher.update(&buffer[..size]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn extract_ect_binary(archive_path: &Path, destination_binary: &Path) -> Result<()> {
    if archive_path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("zip"))
    {
        return extract_ect_from_zip(archive_path, destination_binary);
    }

    if archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.ends_with(".tar.gz"))
    {
        return extract_ect_from_tar_gz(archive_path, destination_binary);
    }

    bail!("지원하지 않는 압축 아카이브 형식입니다.");
}

fn extract_ect_from_zip(archive_path: &Path, destination_binary: &Path) -> Result<()> {
    let file = File::open(archive_path)
        .with_context(|| format!("ZIP 파일 열기 실패: {}", archive_path.display()))?;
    let mut archive = ZipArchive::new(file)
        .with_context(|| format!("ZIP 구조 읽기 실패: {}", archive_path.display()))?;

    let expected_name = ect_binary_name();

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        if entry.is_dir() {
            continue;
        }

        let entry_file_name = Path::new(entry.name())
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();

        if entry_file_name == expected_name {
            let mut output = File::create(destination_binary).with_context(|| {
                format!("ECT 실행 파일 생성 실패: {}", destination_binary.display())
            })?;
            std::io::copy(&mut entry, &mut output).context("ECT 실행 파일 복사 실패")?;
            return Ok(());
        }
    }

    bail!("ZIP 아카이브에서 ECT 실행 파일을 찾지 못했습니다.")
}

fn extract_ect_from_tar_gz(archive_path: &Path, destination_binary: &Path) -> Result<()> {
    let tar_gz = File::open(archive_path)
        .with_context(|| format!("TAR.GZ 파일 열기 실패: {}", archive_path.display()))?;
    let decoder = GzDecoder::new(tar_gz);
    let mut archive = Archive::new(decoder);

    let expected_name = ect_binary_name();
    for entry in archive.entries()? {
        let mut entry = entry?;
        let entry_path = entry.path()?.to_path_buf();
        let entry_file_name = entry_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default();

        if entry_file_name == expected_name {
            let mut output = File::create(destination_binary).with_context(|| {
                format!("ECT 실행 파일 생성 실패: {}", destination_binary.display())
            })?;
            std::io::copy(&mut entry, &mut output).context("ECT 실행 파일 복사 실패")?;
            return Ok(());
        }
    }

    bail!("TAR.GZ 아카이브에서 ECT 실행 파일을 찾지 못했습니다.")
}

fn map_command_error(error: anyhow::Error) -> String {
    let text = error.to_string();
    if is_not_found_error_text(&text) {
        return "파일을 찾을 수 없습니다.".to_string();
    }
    text
}

fn is_not_found_error_text(text: &str) -> bool {
    let lowered = text.to_ascii_lowercase();
    lowered.contains("파일을 찾을 수")
        || lowered.contains("not found")
        || lowered.contains("no such file")
        || lowered.contains("os error 2")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![compress_document])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
