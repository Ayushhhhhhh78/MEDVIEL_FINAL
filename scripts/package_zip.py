import os
import zipfile
import shutil

source_dir = r"D:\hack a sol\MEDVEIL"
dest_zip = r"D:\hack a sol\MEDVEIL.zip"
public_zip = r"D:\hack a sol\MEDVEIL\frontend\public\MEDVEIL.zip"
artifact_zip = r"C:\Users\krishna\.gemini\antigravity\brain\52b59a46-eb6d-4791-ba9c-ea12c3ca2a17\MEDVEIL.zip"

exclude_dirs = {"node_modules", ".next", ".git", "cache", "artifacts"}

print(f"Creating zip archive of {source_dir}...")
with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(source_dir):
        # Exclude specified directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            full_path = os.path.join(root, file)
            # Skip any preexisting zip files or temp files
            if file.endswith(".zip") or file.endswith(".tmp"):
                continue
            rel_path = os.path.relpath(full_path, os.path.dirname(source_dir))
            zipf.write(full_path, rel_path)

size_mb = os.path.getsize(dest_zip) / (1024 * 1024)
print(f"Archive created: {dest_zip} ({size_mb:.2f} MB)")

os.makedirs(os.path.dirname(public_zip), exist_ok=True)
shutil.copy2(dest_zip, public_zip)
print(f"Copied to public frontend: {public_zip}")

os.makedirs(os.path.dirname(artifact_zip), exist_ok=True)
shutil.copy2(dest_zip, artifact_zip)
print(f"Copied to artifact dir: {artifact_zip}")
