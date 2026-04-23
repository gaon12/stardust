use anyhow::{anyhow, bail, Context, Result};
use flate2::read::GzDecoder;
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ColorType, DynamicImage, ImageEncoder};
use lopdf::{Document as PdfDocument, Object as PdfObject, Stream as PdfStream};
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
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

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum DocumentCompressionScope {
    ImageOnly,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
enum MediaTargetFormat {
    Keep,
    Jpg,
    Png,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentCompressionOptions {
    pdf_scope: DocumentCompressionScope,
    pdf_media_format: MediaTargetFormat,
    office_xml_scope: DocumentCompressionScope,
    office_xml_media_format: MediaTargetFormat,
    office_binary_scope: DocumentCompressionScope,
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
    document_options: DocumentCompressionOptions,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CompressionResponse {
    output_path: Option<String>,
    original_bytes: u64,
    compressed_bytes: u64,
    saved_bytes: u64,
    discarded: bool,
    messages: Vec<String>,
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

struct ZipEntryData {
    name: String,
    data: Vec<u8>,
    is_dir: bool,
    compression: CompressionMethod,
    unix_mode: Option<u32>,
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

    let mut messages = Vec::new();

    if extension == "pdf" {
        optimize_pdf(&output_path, &request.document_options, &mut messages)?;
    } else if is_xml_container_extension(&extension) {
        optimize_xml_container(
            &output_path,
            request.document_options.office_xml_scope,
            request.document_options.office_xml_media_format,
            &mut messages,
        )?;
        let ect_binary_path = ensure_ect_installed()?;
        run_ect(&ect_binary_path, &output_path)?;
    } else if is_legacy_binary_extension(&extension) {
        match request.document_options.office_binary_scope {
            DocumentCompressionScope::Full => {
                let ect_binary_path = ensure_ect_installed()?;
                run_ect(&ect_binary_path, &output_path)?;
            }
            DocumentCompressionScope::ImageOnly => {
                messages.push(
                    "구형 바이너리 문서의 이미지 단독 압축은 제한되어 원본을 유지했습니다."
                        .to_string(),
                );
            }
        }
    }

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
            messages,
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
        messages,
    })
}

fn optimize_pdf(
    target_path: &Path,
    options: &DocumentCompressionOptions,
    messages: &mut Vec<String>,
) -> Result<()> {
    let mut document = PdfDocument::load(target_path)
        .with_context(|| format!("PDF 파일 읽기 실패: {}", target_path.display()))?;

    match options.pdf_media_format {
        MediaTargetFormat::Keep => {}
        MediaTargetFormat::Jpg => {
            let converted = convert_pdf_images_to_jpeg(&mut document, 82)?;
            if converted > 0 {
                messages.push(format!(
                    "PDF 내부 이미지 {converted}개를 JPG로 재인코딩했습니다."
                ));
            } else {
                messages.push(
                    "PDF 이미지 변환 가능한 항목이 없어 원본 이미지를 유지했습니다.".to_string(),
                );
            }
        }
        MediaTargetFormat::Png => {
            messages.push(
                "PDF 내부 이미지를 PNG로 직접 변환하는 방식은 구조 제약이 있어 현재는 지원하지 않습니다."
                    .to_string(),
            );
        }
    }

    if matches!(options.pdf_scope, DocumentCompressionScope::Full) {
        let _ = document.prune_objects();
        document.compress();
        let _ = document.renumber_objects();
        document
            .save(target_path)
            .with_context(|| format!("PDF 저장 실패: {}", target_path.display()))?;
    } else {
        document.compress();
        document
            .save(target_path)
            .with_context(|| format!("PDF 저장 실패: {}", target_path.display()))?;
    }

    Ok(())
}

fn convert_pdf_images_to_jpeg(document: &mut PdfDocument, quality: u8) -> Result<usize> {
    let mut converted = 0;

    for object in document.objects.values_mut() {
        let PdfObject::Stream(stream) = object else {
            continue;
        };

        if !is_pdf_image_stream(stream) {
            continue;
        }

        let source_bytes = stream
            .decompressed_content()
            .unwrap_or_else(|_| stream.content.clone());

        let Ok(image) = image::load_from_memory(&source_bytes) else {
            continue;
        };

        let encoded = encode_as_jpeg(&image, quality)?;
        stream.content = encoded;
        stream
            .dict
            .set("Filter", PdfObject::Name(b"DCTDecode".to_vec()));
        let _ = stream.dict.remove(b"DecodeParms");
        converted += 1;
    }

    Ok(converted)
}

fn is_pdf_image_stream(stream: &PdfStream) -> bool {
    matches!(
        stream.dict.get(b"Subtype"),
        Ok(PdfObject::Name(name)) if name.as_slice() == b"Image"
    )
}

fn optimize_xml_container(
    path: &Path,
    scope: DocumentCompressionScope,
    media_format: MediaTargetFormat,
    messages: &mut Vec<String>,
) -> Result<()> {
    let input_file =
        File::open(path).with_context(|| format!("문서 파일 열기 실패: {}", path.display()))?;
    let mut archive = ZipArchive::new(input_file)
        .with_context(|| format!("ZIP 구조 읽기 실패: {}", path.display()))?;

    let mut name_map: HashMap<String, String> = HashMap::new();
    let mut used_names: HashSet<String> = HashSet::new();
    let mut entries: Vec<ZipEntryData> = Vec::new();
    let mut converted_images = 0_u32;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let original_name = entry.name().to_string();
        let compression = match entry.compression() {
            CompressionMethod::Stored => CompressionMethod::Deflated,
            other => other,
        };

        let mut current = ZipEntryData {
            name: original_name.clone(),
            data: Vec::new(),
            is_dir: entry.is_dir(),
            compression,
            unix_mode: entry.unix_mode(),
        };

        if !entry.is_dir() {
            entry.read_to_end(&mut current.data)?;

            if media_format != MediaTargetFormat::Keep && is_document_media_entry(&original_name) {
                if let Some(new_ext) = target_extension(media_format) {
                    if let Some(converted) = convert_image_data(&current.data, media_format) {
                        let proposed_name = replace_entry_extension(&original_name, new_ext);
                        if !used_names.contains(&proposed_name) {
                            name_map.insert(original_name.clone(), proposed_name.clone());
                            current.name = proposed_name;
                        }
                        current.data = converted;
                        converted_images += 1;
                    }
                }
            }

            if matches!(scope, DocumentCompressionScope::Full)
                && is_xml_or_relationship_entry(&current.name)
            {
                if let Ok(text) = std::str::from_utf8(&current.data) {
                    current.data = minify_xml_content(text).into_bytes();
                }
            }
        }

        used_names.insert(current.name.clone());
        entries.push(current);
    }

    if !name_map.is_empty() {
        for entry in &mut entries {
            if entry.is_dir || !is_reference_text_entry(&entry.name) {
                continue;
            }
            let Ok(text) = std::str::from_utf8(&entry.data) else {
                continue;
            };

            let mut updated = text.to_string();
            for (old_name, new_name) in &name_map {
                updated = updated.replace(old_name, new_name);
            }
            entry.data = updated.into_bytes();
        }
    }

    if converted_images > 0 {
        messages.push(format!(
            "문서 내부 이미지 {converted_images}개를 {} 형식으로 정규화했습니다.",
            media_label(media_format)
        ));
    }

    let temp_path = path.with_extension("tmpzip");
    let output_file = File::create(&temp_path)
        .with_context(|| format!("임시 ZIP 생성 실패: {}", temp_path.display()))?;
    let mut writer = ZipWriter::new(output_file);

    for entry in entries {
        let mut options = SimpleFileOptions::default().compression_method(entry.compression);
        if let Some(mode) = entry.unix_mode {
            options = options.unix_permissions(mode);
        }

        if entry.is_dir {
            writer.add_directory(entry.name, options)?;
            continue;
        }

        writer.start_file(entry.name, options)?;
        writer.write_all(&entry.data)?;
    }

    writer.finish()?;
    let _ = fs::remove_file(path);
    fs::rename(&temp_path, path).with_context(|| {
        format!(
            "문서 최적화 결과 반영 실패: {} -> {}",
            temp_path.display(),
            path.display()
        )
    })?;

    Ok(())
}

fn convert_image_data(data: &[u8], target_format: MediaTargetFormat) -> Option<Vec<u8>> {
    let image = image::load_from_memory(data).ok()?;
    match target_format {
        MediaTargetFormat::Keep => None,
        MediaTargetFormat::Jpg => encode_as_jpeg(&image, 82).ok(),
        MediaTargetFormat::Png => encode_as_png(&image).ok(),
    }
}

fn encode_as_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>> {
    let mut buffer = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, quality);
    encoder.encode_image(image).context("JPEG 인코딩 실패")?;
    Ok(buffer)
}

fn encode_as_png(image: &DynamicImage) -> Result<Vec<u8>> {
    let mut cursor = Cursor::new(Vec::new());
    let rgba8 = image.to_rgba8();
    let (width, height) = rgba8.dimensions();

    let encoder =
        PngEncoder::new_with_quality(&mut cursor, CompressionType::Best, FilterType::Adaptive);
    encoder
        .write_image(rgba8.as_raw(), width, height, ColorType::Rgba8.into())
        .context("PNG 인코딩 실패")?;

    Ok(cursor.into_inner())
}

fn target_extension(media_format: MediaTargetFormat) -> Option<&'static str> {
    match media_format {
        MediaTargetFormat::Keep => None,
        MediaTargetFormat::Jpg => Some("jpg"),
        MediaTargetFormat::Png => Some("png"),
    }
}

fn media_label(media_format: MediaTargetFormat) -> &'static str {
    match media_format {
        MediaTargetFormat::Keep => "원본",
        MediaTargetFormat::Jpg => "JPG",
        MediaTargetFormat::Png => "PNG",
    }
}

fn replace_entry_extension(entry_name: &str, extension: &str) -> String {
    let path = Path::new(entry_name);
    let parent = path
        .parent()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    if parent.is_empty() {
        format!("{stem}.{extension}")
    } else {
        format!("{parent}/{stem}.{extension}")
    }
}

fn is_document_media_entry(entry_name: &str) -> bool {
    let lowered = entry_name.to_ascii_lowercase();
    if !(lowered.contains("media/") || lowered.contains("pictures/")) {
        return false;
    }

    lowered.ends_with(".png")
        || lowered.ends_with(".jpg")
        || lowered.ends_with(".jpeg")
        || lowered.ends_with(".bmp")
        || lowered.ends_with(".gif")
        || lowered.ends_with(".webp")
}

fn is_xml_or_relationship_entry(entry_name: &str) -> bool {
    let lowered = entry_name.to_ascii_lowercase();
    lowered.ends_with(".xml") || lowered.ends_with(".rels")
}

fn is_reference_text_entry(entry_name: &str) -> bool {
    let lowered = entry_name.to_ascii_lowercase();
    lowered.ends_with(".xml")
        || lowered.ends_with(".rels")
        || lowered.ends_with(".txt")
        || lowered.ends_with(".rdf")
}

fn minify_xml_content(content: &str) -> String {
    let between_tags = Regex::new(r">\s+<").expect("valid regex");
    between_tags.replace_all(content.trim(), "><").to_string()
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

fn is_legacy_binary_extension(extension: &str) -> bool {
    matches!(extension, "doc" | "xls" | "ppt")
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
