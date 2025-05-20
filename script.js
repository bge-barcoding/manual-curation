class DatabaseBrowser {
    constructor() {
        this.currentPath = '';
        this.fileStructure = {};
        this.allPaths = [];
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadFileStructure();
        this.renderCurrentDirectory();
        this.updateLastUpdated();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        searchInput.addEventListener('input', (e) => {
            this.handleSearch(e.target.value);
        });

        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            this.handleSearch('');
        });

        // Handle enter key in search
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.handleSearch(e.target.value);
            }
        });
    }

    async loadFileStructure() {
        try {
            // Try to load the auto-generated file structure
            await this.loadScript('file-structure.js');
            
            if (window.DATABASE_STRUCTURE) {
                this.fileStructure = window.DATABASE_STRUCTURE;
                this.allPaths = this.getAllPaths(this.fileStructure);
                console.log('Loaded structure from file-structure.js');
                return;
            }
        } catch (error) {
            console.log('Auto-generated structure not available, trying GitHub API...');
        }
        
        try {
            // Fallback to GitHub API to load data directory
            const response = await this.fetchGitHubContents('data');
            this.fileStructure = await this.buildFileStructureFromAPI(response);
            this.allPaths = this.getAllPaths(this.fileStructure);
            console.log('Loaded structure from GitHub API');
        } catch (error) {
            console.error('Failed to load file structure:', error);
            document.getElementById('fileBrowser').innerHTML = `
                <div class="empty-folder">
                    <p>Unable to load database structure</p>
                    <p>Please check back later or contact support</p>
                </div>
            `;
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async fetchGitHubContents(path = '') {
        const GITHUB_USER = 'bge-barcoding';
        const GITHUB_REPO = 'manual-curation';
        const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${path}`;
        
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${path}: ${response.status}`);
        }
        return await response.json();
    }

    async buildFileStructureFromAPI(contents, basePath = '') {
        const structure = {};
        
        for (const item of contents) {
            if (item.type === 'dir') {
                // Recursively load subdirectory contents
                try {
                    const subContents = await this.fetchGitHubContents(item.path);
                    structure[item.name] = {
                        type: 'directory',
                        path: item.path,
                        children: await this.buildFileStructureFromAPI(subContents, item.path)
                    };
                } catch (error) {
                    // If we can't load subdirectory, create empty placeholder
                    structure[item.name] = {
                        type: 'directory',
                        path: item.path,
                        children: {}
                    };
                }
            } else {
                structure[item.name] = {
                    type: 'file',
                    path: item.path,
                    download_url: item.download_url,
                    size: item.size
                };
            }
        }
        
        return structure;
    }

    getAllPaths(structure, currentPath = '', paths = []) {
        for (const [name, item] of Object.entries(structure)) {
            const fullPath = currentPath ? `${currentPath}/${name}` : name;
            paths.push({
                name: name,
                path: fullPath,
                type: item.type
            });
            
            if (item.children) {
                this.getAllPaths(item.children, fullPath, paths);
            }
        }
        return paths;
    }

    handleSearch(query) {
        const fileBrowser = document.getElementById('fileBrowser');
        
        if (!query.trim()) {
            this.renderCurrentDirectory();
            return;
        }

        const results = this.allPaths.filter(item => 
            item.name.toLowerCase().includes(query.toLowerCase()) ||
            item.path.toLowerCase().includes(query.toLowerCase())
        );

        this.renderSearchResults(results, query);
    }

    renderSearchResults(results, query) {
        const fileBrowser = document.getElementById('fileBrowser');
        
        if (results.length === 0) {
            fileBrowser.innerHTML = `
                <div class="empty-folder">
                    <p>No results found for "${query}"</p>
                    <p>Try searching for a different term</p>
                </div>
            `;
            return;
        }

        const html = results.map(item => {
            const icon = item.type === 'directory' ? '📁' : '📄';
            const itemClass = item.type === 'directory' ? 'folder' : 'file';
            const highlightedName = this.highlightText(item.name, query);
            const highlightedPath = this.highlightText(item.path, query);
            
            return `
                <div class="${itemClass} highlight" ${item.type === 'directory' ? `onclick="browser.navigateToPath('${item.path}')"` : ''}>
                    <span class="${item.type === 'directory' ? 'folder-icon' : 'file-icon'}">${icon}</span>
                    <div class="item-name">${highlightedName}</div>
                    <div class="item-info">${highlightedPath}</div>
                    ${item.type === 'file' ? `<button class="download-btn" onclick="browser.downloadFile('${item.path}')">Download</button>` : ''}
                </div>
            `;
        }).join('');

        fileBrowser.innerHTML = html;
    }

    highlightText(text, query) {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    renderCurrentDirectory() {
        const fileBrowser = document.getElementById('fileBrowser');
        const currentStructure = this.getCurrentStructure();
        
        this.updateBreadcrumb();

        if (Object.keys(currentStructure).length === 0) {
            fileBrowser.innerHTML = `
                <div class="empty-folder">
                    <p>This folder is empty</p>
                    <p>Database files will appear here when available</p>
                </div>
            `;
            return;
        }

        const items = Object.entries(currentStructure);
        const directories = items.filter(([name, item]) => item.type === 'directory');
        const files = items.filter(([name, item]) => item.type === 'file');

        const html = [
            ...directories.map(([name, item]) => this.renderDirectoryItem(name, item)),
            ...files.map(([name, item]) => this.renderFileItem(name, item))
        ].join('');

        fileBrowser.innerHTML = html;
    }

    renderDirectoryItem(name, item) {
        return `
            <div class="folder" onclick="browser.navigateToDirectory('${name}')">
                <span class="folder-icon">📁</span>
                <div class="item-name">${name}</div>
                <div class="item-info">Directory</div>
            </div>
        `;
    }

    renderFileItem(name, item) {
        const size = item.size ? this.formatFileSize(item.size) : 'Unknown size';
        return `
            <div class="file">
                <span class="file-icon">📄</span>
                <div class="item-name">${name}</div>
                <div class="item-info">${size}</div>
                <button class="download-btn" onclick="browser.downloadFile('${item.path || this.currentPath + '/' + name}')">Download</button>
            </div>
        `;
    }

    getCurrentStructure() {
        if (!this.currentPath) {
            return this.fileStructure;
        }

        const pathParts = this.currentPath.split('/');
        let current = this.fileStructure;

        for (const part of pathParts) {
            if (current[part] && current[part].children) {
                current = current[part].children;
            } else {
                return {};
            }
        }

        return current;
    }

    navigateToDirectory(dirName) {
        this.currentPath = this.currentPath ? `${this.currentPath}/${dirName}` : dirName;
        this.renderCurrentDirectory();
    }

    navigateToPath(path) {
        this.currentPath = path;
        this.renderCurrentDirectory();
    }

    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        const pathParts = this.currentPath ? this.currentPath.split('/') : [];
        
        let html = '<span class="breadcrumb-item" onclick="browser.navigateToPath(\'\')">📁 Root</span>';
        
        let currentPath = '';
        for (const part of pathParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            html += `<span class="breadcrumb-item" onclick="browser.navigateToPath('${currentPath}')">${part}</span>`;
        }
        
        breadcrumb.innerHTML = html;
    }

    async downloadFile(filePath) {
        try {
            const GITHUB_USER = 'bge-barcoding';
            const GITHUB_REPO = 'manual-curation';
            const downloadUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main/${filePath}`;
            
            // Create temporary download link
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = filePath.split('/').pop();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            alert('Error downloading file. Please try again.');
            console.error('Download error:', error);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    updateLastUpdated() {
        const lastUpdated = document.getElementById('lastUpdated');
        lastUpdated.textContent = new Date().toLocaleDateString();
    }
}

// Initialize the browser when page loads
let browser;
document.addEventListener('DOMContentLoaded', () => {
    browser = new DatabaseBrowser();
});