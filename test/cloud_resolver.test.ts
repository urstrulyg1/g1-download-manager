import { CloudLinkResolver } from '../src/main/media/CloudLinkResolver';

describe('CloudLinkResolver Suite', () => {
  it('should identify and resolve Google Drive direct download links', () => {
    const driveUrl = 'https://drive.google.com/file/d/1ABCxyz7890_test/view?usp=sharing';
    expect(CloudLinkResolver.isCloudUrl(driveUrl)).toBe(true);

    const resolved = CloudLinkResolver.resolve(driveUrl);
    expect(resolved.provider).toBe('GoogleDrive');
    expect(resolved.directDownloadUrl).toContain('export=download&id=1ABCxyz7890_test');
    expect(resolved.isFolder).toBe(false);
  });

  it('should identify Google Drive public folders', () => {
    const folderUrl = 'https://drive.google.com/drive/folders/1FOLDER_XYZ_123';
    const resolved = CloudLinkResolver.resolve(folderUrl);
    expect(resolved.provider).toBe('GoogleDrive');
    expect(resolved.isFolder).toBe(true);
  });

  it('should identify and resolve Dropbox direct download links', () => {
    const dropboxUrl = 'https://www.dropbox.com/s/abcdef123/report.pdf?dl=0';
    expect(CloudLinkResolver.isCloudUrl(dropboxUrl)).toBe(true);

    const resolved = CloudLinkResolver.resolve(dropboxUrl);
    expect(resolved.provider).toBe('Dropbox');
    expect(resolved.directDownloadUrl).toContain('dl.dropboxusercontent.com');
    expect(resolved.directDownloadUrl).toContain('dl=1');
  });

  it('should resolve GitHub raw release assets', () => {
    const githubUrl = 'https://github.com/owner/repo/blob/main/archive.tar.gz';
    const resolved = CloudLinkResolver.resolve(githubUrl);
    expect(resolved.provider).toBe('GitHub');
    expect(resolved.directDownloadUrl).toBe('https://raw.githubusercontent.com/owner/repo/main/archive.tar.gz');
  });
});
