/**
 * GITHUB CONFIGURATION
 * Stores GitHub API credentials for updating firebase-configs.json
 */

// ============================================
// 🔑 ENTER YOUR GITHUB CREDENTIALS HERE
// ============================================

const GITHUB_CONFIG = {
    owner: "MrX2703",           // ← Your GitHub username
    repo: "my-panel",                  // ← Your repository name
    path: "data/firebase-configs.json",      // ← Path to the JSON file
    branch: "main",                          // ← Your branch name (main/gh-pages)
    token: "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"               // ← Your classic GitHub token
};

// ============================================
// DO NOT EDIT BELOW THIS LINE
// ============================================

/**
 * Get the current file SHA from GitHub
 */
async function getFileSHA() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.sha;
        } else if (response.status === 404) {
            return null;
        } else {
            console.error('❌ Error getting SHA:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Error getting SHA:', error);
        return null;
    }
}

/**
 * Save Firebase configs to GitHub JSON file
 */
async function saveFirebaseConfigsToGitHub(configs) {
    try {
        const sha = await getFileSHA();
        
        const content = JSON.stringify(configs, null, 2);
        const encodedContent = btoa(unescape(encodeURIComponent(content)));
        
        const updateData = {
            message: "Update Firebase configs from Mini App",
            content: encodedContent,
            branch: GITHUB_CONFIG.branch
        };
        
        if (sha) {
            updateData.sha = sha;
        }
        
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });
        
        if (response.ok) {
            console.log('✅ Firebase configs saved to GitHub');
            return true;
        } else {
            const error = await response.json();
            console.error('❌ Failed to save to GitHub:', error);
            return false;
        }
    } catch (error) {
        console.error('❌ Error saving to GitHub:', error);
        return false;
    }
}

/**
 * Load Firebase configs from GitHub
 */
async function loadFirebaseConfigsFromGitHub() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_CONFIG.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            const content = JSON.parse(atob(data.content));
            console.log('✅ Firebase configs loaded from GitHub:', content);
            return content;
        } else if (response.status === 404) {
            console.log('📢 File not found on GitHub, creating new one');
            return { sources: [] };
        } else {
            console.error('❌ Error loading from GitHub:', response.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Error loading from GitHub:', error);
        return null;
    }
}

// ────────────────────────────────────────────────
// EXPOSE TO GLOBAL SCOPE
// ────────────────────────────────────────────────

window.GITHUB_CONFIG = GITHUB_CONFIG;
window.getFileSHA = getFileSHA;
window.saveFirebaseConfigsToGitHub = saveFirebaseConfigsToGitHub;
window.loadFirebaseConfigsFromGitHub = loadFirebaseConfigsFromGitHub;
