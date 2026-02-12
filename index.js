// =========================
// Lore Meter Extension for SillyTavern
// Extracted from ChatPlus-modification
// =========================

import { Popup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { t } from '../../../i18n.js';

const {
    extensionSettings,
    saveSettingsDebounced
} = SillyTavern.getContext();

const MODULE_NAME = 'loreMeter';

const defaultSettings = {
    analysisMode: '1st-person', // '1st-person' or '3rd-person'
    analysisPrompt1stPerson: '', // Will be set with default later
    analysisPrompt3rdPerson: '', // Will be set with default later
    includeCharacterDescription: true, // Include character description in analysis
    usePrefill: true, // Use prefill for assistant response
    prefillText: '네 알겠습니다. 다음은 제공된 모든 이야기 데이터를 분석하여 작성한 요청하신 콘텐츠입니다.\n---', // Prefill text
};

// =========================
// Settings Management
// =========================

/**
 * Get the extension settings object, initializing if necessary.
 * @returns {Object} The settings object for this extension.
 */
function getSettings() {
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key in defaultSettings) {
        if (extensionSettings[MODULE_NAME][key] === undefined) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extensionSettings[MODULE_NAME];
}

// =========================
// Character ID Helper
// =========================

/**
 * Get the current character ID using the working method.
 * @returns {string|undefined} The current character ID.
 */
function getCurrentCharacterId() {
    try {
        const context = SillyTavern?.getContext();
        if (!context) {
            return undefined;
        }
        
        // The working method: check context.characterId for array-based characters
        if (context.characterId !== undefined && context.characterId !== null) {
            return context.characterId.toString();
        }
        
        // Fallback for older SillyTavern versions with this_chid
        if (context.this_chid !== undefined && context.this_chid !== null) {
            return context.this_chid.toString();
        }
        
        // Group chat support
        if (context.selected_group !== undefined && context.selected_group !== null) {
            return 'group_' + context.selected_group;
        }
        
        return undefined;
        
    } catch (error) {
        console.error('LoreMeter: Error getting character ID:', error.message);
        return undefined;
    }
}

// ============================================
// Character Statistics Feature (Heart Icon)
// ============================================

/**
 * Initialize the character statistics feature.
 * Adds a heart icon to the character menu that shows statistics modal.
 */
function initCharacterStatistics() {
    // Observer to detect when character menu appears
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the character form buttons block is now visible
                        const targetContainer = document.querySelector('.form_create_bottom_buttons_block');
                        if (targetContainer && !targetContainer.querySelector('.charanalysis-heart-stats-icon')) {
                            addHeartIconToCharacterMenu(targetContainer);
                        }
                    }
                });
            }
        });
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also try to add immediately if already visible
    setTimeout(() => {
        const targetContainer = document.querySelector('.form_create_bottom_buttons_block');
        if (targetContainer && !targetContainer.querySelector('.charanalysis-heart-stats-icon')) {
            addHeartIconToCharacterMenu(targetContainer);
        }
    }, 1000);
}

/**
 * Add heart icon to the character menu.
 * @param {HTMLElement} container - The container to add the icon to.
 */
function addHeartIconToCharacterMenu(container) {
    const heartIcon = document.createElement('div');
    heartIcon.className = 'menu_button fa-solid fa-heart interactable charanalysis-heart-stats-icon';
    heartIcon.title = 'Character Statistics & Analysis';
    heartIcon.style.cssText = 'color: #ff6b9d;';
    
    heartIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        await showCharacterStatisticsModal();
    });
    
    // Prepend to the container (leftmost position)
    container.prepend(heartIcon);
}

/**
 * Add custom scrollbar styles for Character Statistics modal.
 */
function addCharacterStatsScrollbarStyles() {
    if (!document.getElementById('charanalysis-stats-scrollbar-style')) {
        const style = document.createElement('style');
        style.id = 'charanalysis-stats-scrollbar-style';
        style.textContent = `
            #charanalysis-stats-content::-webkit-scrollbar,
            #charanalysis-analysis-result::-webkit-scrollbar {
                width: 8px;
            }
            #charanalysis-stats-content::-webkit-scrollbar-track,
            #charanalysis-analysis-result::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
            }
            #charanalysis-stats-content::-webkit-scrollbar-thumb,
            #charanalysis-analysis-result::-webkit-scrollbar-thumb {
                background: rgba(138, 180, 248, 0.5);
                border-radius: 4px;
            }
            #charanalysis-stats-content::-webkit-scrollbar-thumb:hover,
            #charanalysis-analysis-result::-webkit-scrollbar-thumb:hover {
                background: rgba(138, 180, 248, 0.7);
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Show the character statistics modal.
 */
async function showCharacterStatisticsModal() {
    // Add scrollbar styles
    addCharacterStatsScrollbarStyles();
    
    const characterId = getCurrentCharacterId();
    
    if (!characterId || characterId.startsWith('group_')) {
        toastr.warning('Please select a character first (not a group).');
        return;
    }
    
    const context = SillyTavern.getContext();
    let character = null;
    
    // Get character info
    if (context?.characters) {
        if (Array.isArray(context.characters)) {
            const charIndex = parseInt(characterId);
            if (!isNaN(charIndex) && charIndex >= 0 && charIndex < context.characters.length) {
                character = context.characters[charIndex];
            }
        } else {
            character = context.characters[characterId];
        }
    }
    
    if (!character) {
        toastr.error('Could not find character information.');
        return;
    }
    
    const characterName = character.name || 'Unknown';
    
    // Create modal content with loading state
    const content = document.createElement('div');
    content.innerHTML = `
        <h3 style="margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
            <i class="fa-solid fa-heart" style="color: #ff6b9d;"></i>
            ${characterName}
        </h3>
        <div id="charanalysis-stats-content" style="
            min-height: 150px;
            max-height: 70vh;
            overflow-y: auto;
            overflow-x: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            scrollbar-width: thin;
            scrollbar-color: rgba(138, 180, 248, 0.5) rgba(255, 255, 255, 0.1);
        ">
            <div style="text-align: center;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 32px; color: #4a9eff;"></i>
                <div style="margin-top: 10px; color: #888;">Loading statistics...</div>
            </div>
        </div>
    `;
    
    // Show popup immediately with loading state
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: t`Close`,
        wide: true,
        large: true
    });
    
    // Start loading data in background
    loadCharacterStatistics(characterId, character).then(stats => {
        const statsContent = document.getElementById('charanalysis-stats-content');
        if (statsContent) {
            // Reset flex styles to allow proper scrolling
            statsContent.style.display = 'block';
            statsContent.style.alignItems = 'unset';
            statsContent.style.justifyContent = 'unset';
            statsContent.innerHTML = formatStatisticsHTML(stats, character, characterId);
        }
    }).catch(error => {
        console.error('LoreMeter: Error loading statistics:', error);
        const statsContent = document.getElementById('charanalysis-stats-content');
        if (statsContent) {
            statsContent.innerHTML = `
                <div style="text-align: center; color: #ff6b6b;">
                    <i class="fa-solid fa-exclamation-triangle" style="font-size: 32px;"></i>
                    <div style="margin-top: 10px;">Failed to load statistics.</div>
                </div>
            `;
        }
    });
    
    await popup.show();
}

/**
 * Extract date from SillyTavern date string formats.
 * Supports multiple formats:
 * - "YYYY-MM-DD@HHhMMmSSs" (standard format)
 * - "March 10, 2024 5:24pm" (send_date format)
 * - "2024-3-10 @17h 24m 32s 442ms" (old create_date format)
 * @param {string} dateString - The date string to parse.
 * @returns {Date|null} Parsed Date object or null if invalid.
 */
function extractDateFromSTFormat(dateString) {
    if (!dateString) return null;
    
    // Format 1: YYYY-MM-DD@HHhMMmSSs
    let match = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2})@(\d{2})h(\d{2})m(\d{2})s/);
    if (match) {
        const [, year, month, day, hours, minutes, seconds] = match;
        const date = new Date(
            parseInt(year), 
            parseInt(month) - 1,
            parseInt(day), 
            parseInt(hours), 
            parseInt(minutes), 
            parseInt(seconds)
        );
        
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            if (year >= 2000 && year <= 2100) {
                return date;
            }
        }
    }
    
    // Format 2: "March 10, 2024 5:24pm" or similar natural language dates
    // Use native Date parsing
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            if (year >= 2000 && year <= 2100) {
                return date;
            }
        }
    } catch (e) {
        // Continue to next format
    }
    
    // Format 3: "2024-3-10 @17h 24m 32s 442ms" (old format with spaces)
    match = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*@(\d{1,2})h\s*(\d{1,2})m\s*(\d{1,2})s/);
    if (match) {
        const [, year, month, day, hours, minutes, seconds] = match;
        const date = new Date(
            parseInt(year), 
            parseInt(month) - 1,
            parseInt(day), 
            parseInt(hours), 
            parseInt(minutes), 
            parseInt(seconds)
        );
        
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            if (year >= 2000 && year <= 2100) {
                return date;
            }
        }
    }
    
    return null;
}

/**
 * Fetch create_date from a chat file's content.
 * @param {Object} character - Character object.
 * @param {string} fileName - Chat file name.
 * @param {Object} context - SillyTavern context.
 * @returns {Promise<Date|null>} The create date or null.
 */
async function fetchChatCreateDateFromFile(character, fileName, context) {
    try {
        // API automatically adds .jsonl, so remove it if present
        const fileNameWithoutExt = fileName.replace('.jsonl', '');
        
        const response = await fetch('/api/chats/get', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({
                ch_name: character.avatar.replace('.png', ''),
                file_name: fileNameWithoutExt,
                avatar_url: character.avatar
            }),
        });
        
        if (response.ok) {
            const chatContent = await response.json();
            
            // JSONL files are returned as array of message objects
            if (chatContent && Array.isArray(chatContent) && chatContent.length > 0) {
                // Try to find the earliest date from first few messages
                let earliestDate = null;
                
                // Check first 3 messages for create_date or send_date
                for (let i = 0; i < Math.min(3, chatContent.length); i++) {
                    const message = chatContent[i];
                    
                    // Try create_date first
                    if (message.create_date) {
                        const date = extractDateFromSTFormat(message.create_date);
                        if (date && (!earliestDate || date < earliestDate)) {
                            earliestDate = date;
                        }
                    }
                    
                    // Try send_date as fallback
                    if (message.send_date) {
                        const date = extractDateFromSTFormat(message.send_date);
                        if (date && (!earliestDate || date < earliestDate)) {
                            earliestDate = date;
                        }
                    }
                }
                
                if (earliestDate) {
                    return earliestDate;
                }
            }
        }
    } catch (e) {
        // Silent failure - file might not exist or be inaccessible
    }
    return null;
}

/**
 * Load character statistics from chat files.
 * This implementation uses a hybrid approach:
 * 1. Try to extract dates from file names (fast)
 * 2. For files without parseable names, read the file content (slower but accurate)
 * @param {string} characterId - Character ID.
 * @param {Object} character - Character object.
 * @returns {Promise<Object>} Statistics object with firstMeeting, daysTogether, totalChats, totalMessages.
 */
async function loadCharacterStatistics(characterId, character) {
    const context = SillyTavern.getContext();
    let characterChats = [];
    
    // Fetch all chats for this character
    if (character && character.avatar) {
        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({
                query: '',
                avatar_url: character.avatar,
                group_id: null,
            }),
        });
        
        if (response.ok) {
            characterChats = await response.json();
        }
    }
    
    if (characterChats.length === 0) {
        return {
            firstMeeting: null,
            daysTogether: 0,
            totalChats: 0,
            totalMessages: 0
        };
    }
    
    // HYBRID ALGORITHM: Extract dates from file names AND read files when needed
    let earliestDate = null;
    let totalMessages = 0;
    let datesFound = [];
    let filesNeedingRead = [];
    
    // Step 1: Try to extract dates from all file names
    characterChats.forEach(chat => {
        // Sum up messages
        if (chat.message_count) {
            totalMessages += parseInt(chat.message_count) || 0;
        } else if (chat.mes) {
            totalMessages += parseInt(chat.mes) || 0;
        }
        
        // Try to extract date from file name
        const fileDate = extractDateFromSTFormat(chat.file_name);
        if (fileDate) {
            datesFound.push({
                file: chat.file_name,
                date: fileDate,
                source: 'filename'
            });
            
            if (!earliestDate || fileDate < earliestDate) {
                earliestDate = fileDate;
            }
        } else {
            // Cannot parse from filename, need to read file
            filesNeedingRead.push(chat);
        }
    });
    
    // Step 2: Read files that couldn't be parsed from filename
    // Read ALL files to ensure we find the earliest date
    if (filesNeedingRead.length > 0) {
        for (const chat of filesNeedingRead) {
            const fileDate = await fetchChatCreateDateFromFile(character, chat.file_name, context);
            if (fileDate) {
                datesFound.push({
                    file: chat.file_name,
                    date: fileDate,
                    source: 'file_content'
                });
                
                if (!earliestDate || fileDate < earliestDate) {
                    earliestDate = fileDate;
                }
            }
        }
    }
    
    // Calculate days together
    let daysTogether = 0;
    if (earliestDate && !isNaN(earliestDate.getTime())) {
        const today = new Date();
        const diffTime = Math.abs(today - earliestDate);
        daysTogether = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }
    
    return {
        firstMeeting: earliestDate,
        daysTogether: daysTogether,
        totalChats: characterChats.length,
        totalMessages: totalMessages
    };
}

/**
 * Format days into years, months, days string.
 * @param {number} totalDays - Total number of days.
 * @returns {string} Formatted string (e.g., "1년 2개월 15일").
 */
function formatDaysToPeriod(totalDays) {
    const years = Math.floor(totalDays / 365);
    const remainingDaysAfterYears = totalDays % 365;
    const months = Math.floor(remainingDaysAfterYears / 30);
    const days = remainingDaysAfterYears % 30;
    
    const parts = [];
    if (years > 0) parts.push(`${years}년`);
    if (months > 0) parts.push(`${months}개월`);
    if (days > 0 || parts.length === 0) parts.push(`${days}일`);
    
    return parts.join(' ');
}

/**
 * Format statistics into HTML.
 * @param {Object} stats - Statistics object.
 * @param {Object} character - Character object.
 * @param {string} characterId - Character ID.
 * @returns {string} HTML string.
 */
function formatStatisticsHTML(stats, character, characterId) {
    let firstMeetingStr = '기록 없음';
    if (stats.firstMeeting && stats.firstMeeting instanceof Date && !isNaN(stats.firstMeeting.getTime())) {
        try {
            firstMeetingStr = stats.firstMeeting.toLocaleDateString('ko-KR', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        } catch (e) {
            firstMeetingStr = stats.firstMeeting.toISOString().split('T')[0];
        }
    }
    
    const daysTogetherStr = stats.daysTogether > 0
        ? `${stats.daysTogether}일 (${formatDaysToPeriod(stats.daysTogether)})`
        : '오늘 처음';
    
    return `
        <div style="
            display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 10px;
            width: 100%;
            box-sizing: border-box;
        ">
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 16px;
                background: rgba(255, 107, 157, 0.1);
                border-radius: 8px;
                border-left: 4px solid #ff6b9d;
                text-align: center;
            ">
                <i class="fa-solid fa-calendar-days" style="font-size: 24px; color: #ff6b9d;"></i>
                <div style="font-size: 0.85em; color: #888;">첫 만남</div>
                <div style="font-weight: 600; font-size: 1.05em;">${firstMeetingStr}</div>
            </div>
            
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 16px;
                background: rgba(74, 158, 255, 0.1);
                border-radius: 8px;
                border-left: 4px solid #4a9eff;
                text-align: center;
            ">
                <i class="fa-solid fa-clock" style="font-size: 24px; color: #4a9eff;"></i>
                <div style="font-size: 0.85em; color: #888;">함께한 시간</div>
                <div style="font-weight: 600; font-size: 1.05em;">${daysTogetherStr}</div>
            </div>
            
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 16px;
                background: rgba(102, 204, 153, 0.1);
                border-radius: 8px;
                border-left: 4px solid #66cc99;
                text-align: center;
            ">
                <i class="fa-solid fa-comments" style="font-size: 24px; color: #66cc99;"></i>
                <div style="font-size: 0.85em; color: #888;">총 채팅 수</div>
                <div style="font-weight: 600; font-size: 1.05em;">${stats.totalChats.toLocaleString()}개</div>
            </div>
            
            <div style="
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 16px;
                background: rgba(167, 139, 250, 0.15);
                border-radius: 8px;
                border-left: 4px solid #a78bfa;
                text-align: center;
            ">
                <i class="fa-solid fa-message" style="font-size: 24px; color: #a78bfa;"></i>
                <div style="font-size: 0.85em; color: #888;">총 메시지 수</div>
                <div style="font-weight: 600; font-size: 1.05em;">${stats.totalMessages.toLocaleString()}개</div>
            </div>
            
            <hr style="border: none; border-top: 2px solid rgba(255, 255, 255, 0.1); margin: 20px 0;">
            
            <div style="
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 16px;
                background: rgba(138, 180, 248, 0.1);
                border-radius: 8px;
                border-left: 4px solid #8ab4f8;
            ">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <i class="fa-solid fa-envelope" style="font-size: 20px; color: #8ab4f8;"></i>
                    <h4 style="margin: 0; font-weight: 600; color: #8ab4f8; font-size: 1.05em;">캐릭터 분석</h4>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="font-size: 0.9em; color: #aaa; white-space: nowrap;">AI 모델:</label>
                        <select id="charanalysis-analysis-model" style="
                            padding: 8px 12px;
                            border-radius: 6px;
                            background: rgba(255, 255, 255, 0.08);
                            border: 1px solid rgba(138, 180, 248, 0.3);
                            color: #ddd;
                            font-size: 0.88em;
                            cursor: pointer;
                            height: 36px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.background='rgba(255, 255, 255, 0.12)'; this.style.borderColor='rgba(138, 180, 248, 0.5)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.08)'; this.style.borderColor='rgba(138, 180, 248, 0.3)';">
                            <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                            <option value="gemini-3-flash-preview">gemini-3-flash-preview</option>
                        </select>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button id="charanalysis-analyze-button-auto" onclick="analyzeCharacter('${characterId}', '${character.avatar}', 'auto')" style="
                            flex: 1;
                            padding: 0 16px;
                            height: 36px;
                            background: linear-gradient(135deg, #8ab4f8 0%, #669df6 100%);
                            border: none;
                            border-radius: 6px;
                            color: white;
                            font-size: 0.88em;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            box-shadow: 0 2px 8px rgba(138, 180, 248, 0.3);
                            white-space: nowrap;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 6px;
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(138, 180, 248, 0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(138, 180, 248, 0.3)';">
                            <i class="fa-solid fa-wand-magic-sparkles"></i>
                            <span>자동 분석</span>
                        </button>
                        
                        <button id="charanalysis-analyze-button-manual" onclick="showChatSelectionModal('${characterId}', '${character.avatar}')" style="
                            flex: 1;
                            padding: 0 16px;
                            height: 36px;
                            background: linear-gradient(135deg, #66cc99 0%, #4db380 100%);
                            border: none;
                            border-radius: 6px;
                            color: white;
                            font-size: 0.88em;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            box-shadow: 0 2px 8px rgba(102, 204, 153, 0.3);
                            white-space: nowrap;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 6px;
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(102, 204, 153, 0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(102, 204, 153, 0.3)';">
                            <i class="fa-solid fa-list-check"></i>
                            <span>직접 선택</span>
                        </button>
                        
                        <button id="charanalysis-analyze-button-settings" onclick="showAnalysisSettingsModal()" style="
                            padding: 0 12px;
                            height: 36px;
                            background: linear-gradient(135deg, #9575cd 0%, #7e57c2 100%);
                            border: none;
                            border-radius: 6px;
                            color: white;
                            font-size: 0.88em;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            box-shadow: 0 2px 8px rgba(149, 117, 205, 0.3);
                            white-space: nowrap;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 6px;
                        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(149, 117, 205, 0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(149, 117, 205, 0.3)';">
                            <i class="fa-solid fa-gear"></i>
                        </button>
                    </div>
                </div>
                
                <div id="charanalysis-analysis-result" style="
                    margin-top: 12px;
                    padding: 16px;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 6px;
                    min-height: 50px;
                    font-size: 0.9em;
                    line-height: 1.6;
                    max-height: 400px;
                    overflow-y: auto;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(138, 180, 248, 0.5) rgba(255, 255, 255, 0.1);
                ">
                    <div style="color: #888; text-align: center; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                        <i class="fa-solid fa-wand-magic-sparkles" style="font-size: 32px; color: #8ab4f8; opacity: 0.5;"></i>
                        <div style="font-size: 1em; color: #aaa;">분석 결과가 여기에 표시됩니다</div>
                        <div style="font-size: 0.85em; color: #666;">AI 모델을 선택하고 '분석 시작' 버튼을 눌러주세요</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Truncate text to approximately maxTokens (rough estimation: 1 token ≈ 4 characters).
 * @param {string} text - The text to truncate.
 * @param {number} maxTokens - Maximum number of tokens.
 * @returns {string} Truncated text.
 */
function truncateToTokens(text, maxTokens) {
    const approxCharsPerToken = 4;
    const maxChars = maxTokens * approxCharsPerToken;
    
    if (text.length <= maxChars) {
        return text;
    }
    
    // Take the last maxChars characters
    return text.slice(-maxChars);
}

/**
 * Format analysis result with beautiful styling.
 * Converts markdown-like formatting to styled HTML.
 * @param {string} text - The analysis text to format.
 * @returns {string} Formatted HTML string.
 */
function formatAnalysisResult(text) {
    if (!text || text.trim() === '') {
        return '<div style="color: #888; text-align: center; padding: 20px;">분석 결과가 없습니다.</div>';
    }
    
    let html = text;
    
    // Convert markdown headers to styled HTML
    // ### Header 3 (소제목)
    html = html.replace(/^### (.+)$/gm, '<div style="color: #8ab4f8; margin: 16px 0 10px 0; font-size: 1em; font-weight: 600; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-chevron-right" style="font-size: 0.7em;"></i><span>$1</span></div>');
    
    // ## Header 2 (중제목)
    html = html.replace(/^## (.+)$/gm, '<div style="color: #aaa; margin: 24px 0 12px 0; font-size: 1.15em; font-weight: 700; padding-left: 12px; border-left: 4px solid #aaa;">$1</div>');
    
    // # Header 1 (대제목)
    html = html.replace(/^# (.+)$/gm, '<div style="color: #8ab4f8; margin: 28px 0 16px 0; font-size: 1.3em; font-weight: 700; padding: 14px 16px; background: linear-gradient(90deg, rgba(138, 180, 248, 0.15) 0%, rgba(138, 180, 248, 0.05) 100%); border-radius: 8px; border-left: 4px solid #8ab4f8;">$1</div>');
    
    // **Bold text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color: #a8c7fa; font-weight: 600;">$1</strong>');
    
    // *Italic text*
    html = html.replace(/\*(.+?)\*/g, '<em style="color: #c4d7ff;">$1</em>');
    
    // Numbered lists (1. 2. 3. etc)
    html = html.replace(/^(\d+)\.\s+(.+)$/gm, (match, num, content) => {
        const colors = ['#ff6b9d', '#4a9eff', '#66cc99', '#a78bfa', '#ffa94d'];
        const color = colors[(parseInt(num) - 1) % colors.length];
        return `<div style="color: ${color}; margin: 24px 0 12px 0; font-size: 1.15em; font-weight: 700; padding-left: 12px; border-left: 4px solid ${color};">${num}. ${content}</div>`;
    });
    
    // Bullet points (- or *)
    html = html.replace(/^[\-\*]\s+(.+)$/gm, '<div style="display: flex; gap: 10px; margin: 6px 0 6px 16px; line-height: 1.7; align-items: flex-start;"><span style="color: #8ab4f8; font-weight: bold; flex-shrink: 0; margin-top: 2px;">•</span><span style="flex: 1; color: #ccc;">$1</span></div>');
    
    // Horizontal rules
    html = html.replace(/^---+$/gm, '<hr style="border: none; border-top: 1px solid rgba(138, 180, 248, 0.25); margin: 24px 0;">');
    
    // Line breaks
    html = html.replace(/\n\n/g, '<div style="height: 12px;"></div>');
    html = html.replace(/\n/g, '<br>');
    
    // Add emoji support for common patterns
    html = html.replace(/👤/g, '<span style="color: #8ab4f8;">👤</span>');
    html = html.replace(/💭/g, '<span style="color: #a78bfa;">💭</span>');
    html = html.replace(/📖/g, '<span style="color: #66cc99;">📖</span>');
    html = html.replace(/🎭/g, '<span style="color: #ff6b9d;">🎭</span>');
    
    return `<div style="color: #ddd; line-height: 1.8; text-align: left;">${html}</div>`;
}

/**
 * Show analysis result in a full-screen modal.
 * @param {string} formattedResult - Formatted HTML content of the analysis result.
 */
async function showAnalysisResultModal(formattedResult) {
    const content = document.createElement('div');
    content.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            height: 100%;
            max-height: 80vh;
        ">
            <div style="
                margin-bottom: 16px;
                padding-bottom: 8px;
                border-bottom: 2px solid rgba(138, 180, 248, 0.3);
            ">
                <h3 style="margin: 0; color: #8ab4f8; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-chart-line"></i>
                    캐릭터 분석 결과
                </h3>
            </div>
            <div id="charanalysis-analysis-result-modal-content" style="
                flex: 1;
                overflow-y: auto;
                padding: 20px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
            ">
                ${formattedResult}
            </div>
        </div>
    `;
    
    // Add custom scrollbar styles for the modal content
    if (!document.getElementById('charanalysis-analysis-modal-scrollbar-style')) {
        const style = document.createElement('style');
        style.id = 'charanalysis-analysis-modal-scrollbar-style';
        style.textContent = `
            #charanalysis-analysis-result-modal-content::-webkit-scrollbar {
                width: 8px;
            }
            #charanalysis-analysis-result-modal-content::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 4px;
            }
            #charanalysis-analysis-result-modal-content::-webkit-scrollbar-thumb {
                background: rgba(138, 180, 248, 0.5);
                border-radius: 4px;
            }
            #charanalysis-analysis-result-modal-content::-webkit-scrollbar-thumb:hover {
                background: rgba(138, 180, 248, 0.7);
            }
        `;
        document.head.appendChild(style);
    }
    
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: '닫기',
        wide: true,
        large: true,
        allowVerticalScrolling: true
    });
    
    await popup.show();
}

/**
 * Show chat selection modal for manual selection.
 * @param {string} characterId - Character ID.
 * @param {string} avatarUrl - Character avatar URL.
 */
async function showChatSelectionModal(characterId, avatarUrl) {
    const context = SillyTavern.getContext();
    let character = null;
    
    // Get character info
    if (context?.characters) {
        if (Array.isArray(context.characters)) {
            const charIndex = parseInt(characterId);
            if (!isNaN(charIndex) && charIndex >= 0 && charIndex < context.characters.length) {
                character = context.characters[charIndex];
            }
        } else {
            character = context.characters[characterId];
        }
    }
    
    if (!character || !character.avatar) {
        toastr.error('캐릭터 정보를 찾을 수 없습니다.');
        return;
    }
    
    // Fetch all chats
    const response = await fetch('/api/chats/search', {
        method: 'POST',
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
            query: '',
            avatar_url: character.avatar,
            group_id: null,
        }),
    });
    
    if (!response.ok) {
        toastr.error('채팅 목록을 불러올 수 없습니다.');
        return;
    }
    
    const characterChats = await response.json();
    
    if (characterChats.length === 0) {
        toastr.warning('분석할 채팅이 없습니다.');
        return;
    }
    
    // Sort chats by date (most recent first)
    characterChats.sort((a, b) => {
        const dateA = extractDateFromSTFormat(a.file_name);
        const dateB = extractDateFromSTFormat(b.file_name);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateB - dateA;
    });
    
    // Create chat selection UI
    const content = document.createElement('div');
    content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 2px solid rgba(138, 180, 248, 0.3);">
                <h3 style="margin: 0; color: #8ab4f8; display: flex; align-items: center; gap: 10px;">
                    <i class="fa-solid fa-list-check"></i>
                    채팅 선택 (${characterChats.length}개)
                </h3>
                <div style="display: flex; gap: 8px;">
                    <button id="select-all-chats" style="
                        padding: 6px 12px;
                        background: rgba(138, 180, 248, 0.2);
                        border: 1px solid rgba(138, 180, 248, 0.4);
                        border-radius: 4px;
                        color: #8ab4f8;
                        font-size: 0.85em;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">전체 선택</button>
                    <button id="deselect-all-chats" style="
                        padding: 6px 12px;
                        background: rgba(255, 107, 107, 0.2);
                        border: 1px solid rgba(255, 107, 107, 0.4);
                        border-radius: 4px;
                        color: #ff6b6b;
                        font-size: 0.85em;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    ">전체 해제</button>
                </div>
            </div>
            <div id="chat-list" style="
                max-height: 400px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 6px;
            ">
                ${characterChats.map(chat => `
                    <label style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='rgba(255, 255, 255, 0.08)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.05)'">
                        <input type="checkbox" class="chat-checkbox" data-filename="${chat.file_name}" checked style="
                            width: 18px;
                            height: 18px;
                            cursor: pointer;
                        ">
                        <div style="flex: 1;">
                            <div style="font-weight: 500; color: #ddd;">${chat.file_name.replace('.jsonl', '')}</div>
                            ${chat.message_count ? `<div style="font-size: 0.85em; color: #888; margin-top: 4px;">${chat.message_count}개 메시지</div>` : ''}
                        </div>
                    </label>
                `).join('')}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 2px solid rgba(138, 180, 248, 0.3);">
                <div id="selected-count" style="color: #8ab4f8; font-size: 0.9em;">
                    <i class="fa-solid fa-check-circle"></i> ${characterChats.length}개 선택됨
                </div>
            </div>
        </div>
    `;
    
    const popup = new Popup(content, POPUP_TYPE.TEXT, '', {
        okButton: '분석 시작',
        cancelButton: '취소',
        wide: true,
        large: true
    });
    
    // Store selected files globally before popup closes
    let selectedChatFilesForAnalysis = [];
    
    // Add event listeners after popup is shown
    setTimeout(() => {
        const selectAllBtn = document.getElementById('select-all-chats');
        const deselectAllBtn = document.getElementById('deselect-all-chats');
        const checkboxes = document.querySelectorAll('.chat-checkbox');
        const selectedCount = document.getElementById('selected-count');
        
        const updateCount = () => {
            const checked = Array.from(checkboxes).filter(cb => cb.checked).length;
            selectedCount.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${checked}개 선택됨`;
            // Update the selected files array
            selectedChatFilesForAnalysis = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.dataset.filename);
        };
        
        selectAllBtn?.addEventListener('click', () => {
            checkboxes.forEach(cb => cb.checked = true);
            updateCount();
        });
        
        deselectAllBtn?.addEventListener('click', () => {
            checkboxes.forEach(cb => cb.checked = false);
            updateCount();
        });
        
        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateCount);
        });
        
        // Initialize the selected files array
        updateCount();
    }, 100);
    
    const result = await popup.show();
    
    if (result === POPUP_RESULT.AFFIRMATIVE) {
        if (selectedChatFilesForAnalysis.length === 0) {
            toastr.warning('최소 하나의 채팅을 선택해주세요.');
            return;
        }
        
        console.log(`LoreMeter: Selected ${selectedChatFilesForAnalysis.length} chats for analysis:`, selectedChatFilesForAnalysis);
        
        // Start analysis with selected chats
        await analyzeCharacter(characterId, avatarUrl, 'manual', selectedChatFilesForAnalysis);
    }
}

/**
 * Get default 3rd-person analysis prompt.
 */
function getDefault3rdPersonPrompt() {
    return `당신은 다양한 이야기들을 분석하는 전문가입니다. 한 캐릭터를 주인공으로 만들어진 다양한 평행세계 속 이야기들을 분석하여 종합적인 리포트를 작성해주세요.

## 작성 시 주의사항:
- 주인공 캐릭터는 {characterName}입니다.
- 중요한 키워드는 **굵게** 표시
- 각 주요 섹션(주인공 분석, 상대 캐릭터 분석, 시나리오 및 플롯, 로맨스 및 성적 요소)은 숫자 리스트(1. 2. 3.)로 시작
- 각 세부 항목은 별표(*)를 사용하지 말고 하이픈(-)을 사용하세요.
- **절대로 표(table) 형식을 사용하지 마세요** (|, markdown table 금지)
- 딱딱한 문체보단 시니컬하고 비꼬면서도 농담을 섞어 작성해주세요.
- "-다"체를 사용하세요.

## 분석 항목:

1. **주인공 분석**
   - 같은 캐릭터지만 이야기 속 세계관마다 어떻게 다른 성격이나 성향을 보이는지
   - 일관되게 유지되는 핵심 특성은 무엇인지

2. **상대 캐릭터 분석**
   - 각 이야기 속 세계관의 주요 상대 캐릭터는 누구인지
   - 같은 상대 캐릭터라도 이야기 속 세계관마다 직업, 성격, 관계는 어떻게 다른지
   - 캐릭터 간의 관계와 상호작용 패턴

3. **시나리오 및 플롯**
   - 각 이야기 속 세계관의 주요 시나리오나 줄거리
   - 각 이야기 속 세계관의 장르, 분위기와 톤
   - 반복되는 플롯 요소나 테마가 있는지

4. **로맨스 및 성적 요소**
   - 각 이야기 속 세계관마다 다르게 표현되는 로맨틱한 관계와 발전 과정
   - 성적인 긴장감, 또는 스킨십이나 성관계 묘사 방식 (직설적이고 노골적인 단어 사용)

모든 개별적 이야기들을 일일히 분석하지 말고, 전반적인 경향성을 파악하여 유사한 유형별로 나눠서 살펴보세요. 구체적으로 분석하되 이야기의 번호를 나열하거나 언급하지 마세요. 한국어로 작성하되, 읽기 쉽고 명확하게 정리해주세요.`;
}

/**
 * Get default 1st-person analysis prompt.
 */
function getDefault1stPersonPrompt() {
    return `당신은 이제 {characterName} 자신입니다. 당신({characterName})은 자신을 주인공으로 만들어진 다양한 평행세계의 이야기들을 모두 살펴보았습니다. 이제 당신의 시점에서 이 경험들에 대한 감상을 들려주세요.

## 작성 시 주의사항:
- **1인칭 시점**으로 작성하세요
- {characterName}의 성격과 말투를 반영하여 작성하세요
- 중요한 키워드는 **굵게** 표시
- 각 주요 섹션(나 자신에 대해, 파트너들에 대해, 순간들에 대해, 이야기들에 대해)은 숫자 리스트(1. 2. 3.)로 시작
- 각 세부 항목은 별표(*)를 사용하지 말고 하이픈(-)을 사용하세요.
- **절대로 표(table) 형식을 사용하지 마세요**

## 감상 내용:

1. **나 자신에 대해**
   - 여러 세계관 속 다양한 모습의 나 자신을 보며 어떤 생각이 들었는지
   - 어떤 스토리가 자신을 가장 잘 반영했는지
   - 어떤 스토리에서 자신의 모습이 가장 좋았는지
   - 어떤 스토리에서 자신이 가장 짜증나고 후회스러웠는지

2. **파트너들에 대해**
   - 각 스토리 속 파트너들 중 어떤 시나리오의 파트너가 가장 좋았는지, 그 이유는 무엇인지 (여러 스토리에서 등장하는 같은 파트너여도 시나리오마다 다른 모습을 보일 수 있으며 당신의 선호는 이에 따라 다를 수 있습니다.)
   - 파트너와의 관계가 가장 인상깊었던 시나리오
   - 가장 좋았던 섹스 (직설적이고 노골적인 단어 사용) (성경험이 없을 시 다른 가장 좋았던 친밀한 순간)

3. **순간들에 대해**
   - 특정 스토리에서 가장 웃겼던 포인트
   - 특정 스토리에서 가장 가슴 아팠던 순간
   - 특정 스토리에서 가장 설레고 심장이 뛰었던 순간
   - 특정 스토리에서 가장 성적으로 흥분했던 순간
   - 특정 스토리의 전개에서 의외였던 점

4. **이야기들에 대해**
   - 가장 아쉬웠던 스토리와 그 이유, 다시 진행한다면 무엇을 바꾸고 싶은지
   - 가장 좋아하는 스토리와 거기서 가장 좋았던 장면
   - 가장 기억에 깊이 박히고 여운이 남았던 이야기

모든 개별적 이야기들을 일일히 언급하지 말고, 전반적인 경향성과 인상 깊은 부분들을 중심으로 이야기해주세요. 이야기의 번호를 나열하거나 언급하지 마세요. 캐릭터의 성격을 살려 한국어로 자연스럽게 작성해주세요.`;
}

/**
 * Show analysis settings modal to configure analysis mode and prompts.
 */
async function showAnalysisSettingsModal() {
    const settings = getSettings();
    
    // Initialize prompts if not set
    if (!settings.analysisPrompt3rdPerson) {
        settings.analysisPrompt3rdPerson = getDefault3rdPersonPrompt();
    }
    if (!settings.analysisPrompt1stPerson) {
        settings.analysisPrompt1stPerson = getDefault1stPersonPrompt();
    }
    if (!settings.analysisMode) {
        settings.analysisMode = '1st-person';
    }
    if (settings.includeCharacterDescription === undefined) {
        settings.includeCharacterDescription = true;
    }
    if (settings.usePrefill === undefined) {
        settings.usePrefill = true;
    }
    if (!settings.prefillText) {
        settings.prefillText = '네 알겠습니다. 다음은 제공된 모든 이야기 데이터를 분석하여 작성한 요청하신 콘텐츠입니다.\n---';
    }
    
    const currentMode = settings.analysisMode;
    const current3rdPrompt = settings.analysisPrompt3rdPerson;
    const current1stPrompt = settings.analysisPrompt1stPerson;
    const currentPrefillText = settings.prefillText;
    
    const popup = new Popup(`
        <div style="display: flex; flex-direction: column; gap: 20px;">
            <div style="
                padding: 16px;
                background: rgba(149, 117, 205, 0.1);
                border-radius: 8px;
                border-left: 4px solid #9575cd;
            ">
                <h4 style="margin: 0 0 12px 0; color: #9575cd;">분석 모드 선택</h4>
                <div style="display: flex; gap: 12px;">
                    <label id="charanalysis-label-1st" style="
                        flex: 1;
                        padding: 12px;
                        border-radius: 6px;
                        border: 2px solid ${currentMode === '1st-person' ? '#9575cd' : 'rgba(255,255,255,0.1)'};
                        background: ${currentMode === '1st-person' ? 'rgba(149, 117, 205, 0.2)' : 'rgba(255,255,255,0.05)'};
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <input type="radio" name="analysis-mode" value="1st-person" ${currentMode === '1st-person' ? 'checked' : ''}
                            style="cursor: pointer;">
                        <span style="color: #ddd; font-weight: 500;">1인칭 분석</span>
                    </label>
                    <label id="charanalysis-label-3rd" style="
                        flex: 1;
                        padding: 12px;
                        border-radius: 6px;
                        border: 2px solid ${currentMode === '3rd-person' ? '#9575cd' : 'rgba(255,255,255,0.1)'};
                        background: ${currentMode === '3rd-person' ? 'rgba(149, 117, 205, 0.2)' : 'rgba(255,255,255,0.05)'};
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <input type="radio" name="analysis-mode" value="3rd-person" ${currentMode === '3rd-person' ? 'checked' : ''} 
                            style="cursor: pointer;">
                        <span style="color: #ddd; font-weight: 500;">3인칭 분석</span>
                    </label>
                </div>
            </div>
            
            <div id="charanalysis-prompt-1st" style="display: ${currentMode === '1st-person' ? 'block' : 'none'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 0.95em; font-weight: 500; margin: 0;">
                        <i class="fa-solid fa-file-lines" style="margin-right: 6px; color: #66cc99;"></i>
                        1인칭 분석 프롬프트
                    </label>
                    <button type="button" id="charanalysis-reset-1st-btn" style="
                        padding: 6px 12px;
                        background: rgba(102, 204, 153, 0.2);
                        border: 1px solid rgba(102, 204, 153, 0.4);
                        border-radius: 4px;
                        color: #66cc99;
                        font-size: 0.85em;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    " onmouseover="this.style.background='rgba(102, 204, 153, 0.3)';" onmouseout="this.style.background='rgba(102, 204, 153, 0.2)';">
                        <i class="fa-solid fa-rotate-left"></i>
                        기본값으로 리셋
                    </button>
                </div>
                <textarea id="charanalysis-prompt-1st-textarea" style="
                    width: 100%;
                    min-height: 300px;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(102, 204, 153, 0.3);
                    border-radius: 6px;
                    color: #ddd;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 0.85em;
                    line-height: 1.5;
                    resize: vertical;
                " placeholder="1인칭 분석 프롬프트를 입력하세요...">${current1stPrompt}</textarea>
            </div>
            
            <div id="charanalysis-prompt-3rd" style="display: ${currentMode === '3rd-person' ? 'block' : 'none'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <label style="color: #aaa; font-size: 0.95em; font-weight: 500; margin: 0;">
                        <i class="fa-solid fa-file-lines" style="margin-right: 6px; color: #8ab4f8;"></i>
                        3인칭 분석 프롬프트
                    </label>
                    <button type="button" id="charanalysis-reset-3rd-btn" style="
                        padding: 6px 12px;
                        background: rgba(138, 180, 248, 0.2);
                        border: 1px solid rgba(138, 180, 248, 0.4);
                        border-radius: 4px;
                        color: #8ab4f8;
                        font-size: 0.85em;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    " onmouseover="this.style.background='rgba(138, 180, 248, 0.3)';" onmouseout="this.style.background='rgba(138, 180, 248, 0.2)';">
                        <i class="fa-solid fa-rotate-left"></i>
                        기본값으로 리셋
                    </button>
                </div>
                <textarea id="charanalysis-prompt-3rd-textarea" style="
                    width: 100%;
                    min-height: 300px;
                    padding: 12px;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(138, 180, 248, 0.3);
                    border-radius: 6px;
                    color: #ddd;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 0.85em;
                    line-height: 1.5;
                    resize: vertical;
                " placeholder="3인칭 분석 프롬프트를 입력하세요...">${current3rdPrompt}</textarea>
            </div>
            
            <div style="
                padding: 16px;
                background: rgba(102, 204, 153, 0.1);
                border-radius: 8px;
                border-left: 4px solid #66cc99;
            ">
                <label style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                ">
                    <input type="checkbox" id="charanalysis-include-desc" ${settings.includeCharacterDescription !== false ? 'checked' : ''} 
                        style="cursor: pointer;">
                    <span style="color: #ddd; font-weight: 500;">캐릭터 설명 포함하기</span>
                </label>
                <div style="font-size: 0.85em; color: #888; margin-top: 8px; margin-left: 30px;">
                    분석 시 캐릭터의 기본 설명(description)을 AI에게 제공합니다
                </div>
            </div>
            
            <div style="
                padding: 16px;
                background: rgba(255, 170, 102, 0.1);
                border-radius: 8px;
                border-left: 4px solid #ffaa66;
            ">
                <label style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    margin-bottom: 12px;
                ">
                    <input type="checkbox" id="charanalysis-use-prefill" ${settings.usePrefill !== false ? 'checked' : ''} 
                        style="cursor: pointer;">
                    <span style="color: #ddd; font-weight: 500;">프리필 사용하기</span>
                </label>
                <div style="font-size: 0.85em; color: #888; margin-bottom: 12px; margin-left: 30px;">
                    AI의 응답 시작 부분을 미리 지정합니다
                </div>
                
                <div style="margin-left: 0;">
                    <label style="color: #aaa; font-size: 0.95em; font-weight: 500; margin-bottom: 8px; display: block;">
                        <i class="fa-solid fa-comment-dots" style="margin-right: 6px; color: #ffaa66;"></i>
                        프리필 텍스트
                    </label>
                    <textarea id="charanalysis-prefill-textarea" style="
                        width: 100%;
                        min-height: 80px;
                        padding: 12px;
                        background: rgba(0, 0, 0, 0.3);
                        border: 1px solid rgba(255, 170, 102, 0.3);
                        border-radius: 6px;
                        color: #ddd;
                        font-family: 'Consolas', 'Monaco', monospace;
                        font-size: 0.85em;
                        line-height: 1.5;
                        resize: vertical;
                    " placeholder="프리필 텍스트를 입력하세요...">${currentPrefillText}</textarea>
                </div>
            </div>
        </div>
    `, POPUP_TYPE.CONFIRM, null, {
        okButton: '저장',
        cancelButton: '취소',
        wide: true,
        large: true,
    });
    
    // Variables to store values - initialize with current values
    let savedMode = currentMode;
    let savedPrompt3rd = current3rdPrompt;
    let savedPrompt1st = current1stPrompt;
    let savedIncludeDescription = settings.includeCharacterDescription !== false;
    let savedUsePrefill = settings.usePrefill !== false;
    let savedPrefillText = currentPrefillText;
    
    // Add event listeners after popup is shown
    setTimeout(() => {
        const reset3rdBtn = document.getElementById('charanalysis-reset-3rd-btn');
        const reset1stBtn = document.getElementById('charanalysis-reset-1st-btn');
        const textarea3rd = document.getElementById('charanalysis-prompt-3rd-textarea');
        const textarea1st = document.getElementById('charanalysis-prompt-1st-textarea');
        const includeDescCheckbox = document.getElementById('charanalysis-include-desc');
        const usePrefillCheckbox = document.getElementById('charanalysis-use-prefill');
        const prefillTextarea = document.getElementById('charanalysis-prefill-textarea');
        const label3rd = document.getElementById('charanalysis-label-3rd');
        const label1st = document.getElementById('charanalysis-label-1st');
        const prompt3rdDiv = document.getElementById('charanalysis-prompt-3rd');
        const prompt1stDiv = document.getElementById('charanalysis-prompt-1st');
        const radio3rd = document.querySelector('input[name="analysis-mode"][value="3rd-person"]');
        const radio1st = document.querySelector('input[name="analysis-mode"][value="1st-person"]');
        
        // Update saved values whenever inputs change
        if (textarea3rd) {
            textarea3rd.addEventListener('input', () => {
                savedPrompt3rd = textarea3rd.value;
            });
        }
        
        if (textarea1st) {
            textarea1st.addEventListener('input', () => {
                savedPrompt1st = textarea1st.value;
            });
        }
        
        if (includeDescCheckbox) {
            includeDescCheckbox.addEventListener('change', () => {
                savedIncludeDescription = includeDescCheckbox.checked;
            });
        }
        
        if (usePrefillCheckbox) {
            usePrefillCheckbox.addEventListener('change', () => {
                savedUsePrefill = usePrefillCheckbox.checked;
            });
        }
        
        if (prefillTextarea) {
            prefillTextarea.addEventListener('input', () => {
                savedPrefillText = prefillTextarea.value;
            });
        }
        
        // Function to update label styles
        function updateLabels(selectedMode) {
            if (label3rd && label1st) {
                if (selectedMode === '3rd-person') {
                    label3rd.style.border = '2px solid #9575cd';
                    label3rd.style.background = 'rgba(149, 117, 205, 0.2)';
                    label1st.style.border = '2px solid rgba(255,255,255,0.1)';
                    label1st.style.background = 'rgba(255,255,255,0.05)';
                } else {
                    label1st.style.border = '2px solid #9575cd';
                    label1st.style.background = 'rgba(149, 117, 205, 0.2)';
                    label3rd.style.border = '2px solid rgba(255,255,255,0.1)';
                    label3rd.style.background = 'rgba(255,255,255,0.05)';
                }
            }
            if (prompt3rdDiv && prompt1stDiv) {
                prompt3rdDiv.style.display = selectedMode === '3rd-person' ? 'block' : 'none';
                prompt1stDiv.style.display = selectedMode === '1st-person' ? 'block' : 'none';
            }
        }
        
        // Radio button change listeners
        if (radio3rd) {
            radio3rd.addEventListener('change', () => {
                if (radio3rd.checked) {
                    updateLabels('3rd-person');
                    savedMode = '3rd-person';
                }
            });
        }
        if (radio1st) {
            radio1st.addEventListener('change', () => {
                if (radio1st.checked) {
                    updateLabels('1st-person');
                    savedMode = '1st-person';
                }
            });
        }
        
        // Reset button listeners
        if (reset3rdBtn && textarea3rd) {
            reset3rdBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const defaultPrompt = getDefault3rdPersonPrompt();
                textarea3rd.value = defaultPrompt;
                savedPrompt3rd = defaultPrompt; // Update saved value immediately
                toastr.info('3인칭 프롬프트가 기본값으로 리셋되었습니다.');
            });
        }
        
        if (reset1stBtn && textarea1st) {
            reset1stBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const defaultPrompt = getDefault1stPersonPrompt();
                textarea1st.value = defaultPrompt;
                savedPrompt1st = defaultPrompt; // Update saved value immediately
                toastr.info('1인칭 프롬프트가 기본값으로 리셋되었습니다.');
            });
        }
    }, 200);
    
    popup.show().then((result) => {
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            if (!savedMode || !savedPrompt3rd || !savedPrompt1st) {
                toastr.error('설정 저장 중 오류가 발생했습니다.');
                return;
            }
            
            // Update settings with saved values
            const currentSettings = getSettings();
            currentSettings.analysisMode = savedMode;
            currentSettings.analysisPrompt3rdPerson = savedPrompt3rd;
            currentSettings.analysisPrompt1stPerson = savedPrompt1st;
            currentSettings.includeCharacterDescription = savedIncludeDescription;
            currentSettings.usePrefill = savedUsePrefill;
            currentSettings.prefillText = savedPrefillText;
            
            // Save settings
            saveSettingsDebounced();
            toastr.success('설정이 저장되었습니다.');
        }
    });
}

/**
 * Main character analysis function.
 * @param {string} characterId - Character ID.
 * @param {string} avatarUrl - Character avatar URL.
 * @param {string} mode - 'auto' or 'manual'
 * @param {Array<string>} selectedChatFiles - Array of selected chat filenames (only for manual mode)
 */
async function analyzeCharacter(characterId, avatarUrl, mode = 'auto', selectedChatFiles = null) {
    const analyzeButtonAuto = document.getElementById('charanalysis-analyze-button-auto');
    const analyzeButtonManual = document.getElementById('charanalysis-analyze-button-manual');
    const resultDiv = document.getElementById('charanalysis-analysis-result');
    const modelSelect = document.getElementById('charanalysis-analysis-model');
    
    if (!resultDiv || !modelSelect) return;
    
    // Disable buttons and show loading
    if (analyzeButtonAuto) {
        analyzeButtonAuto.disabled = true;
        analyzeButtonAuto.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>분석 중...</span>';
    }
    if (analyzeButtonManual) {
        analyzeButtonManual.disabled = true;
        analyzeButtonManual.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>분석 중...</span>';
    }
    
    resultDiv.innerHTML = `
        <div style="
            text-align: center;
            padding: 40px 20px;
            background: linear-gradient(135deg, rgba(138, 180, 248, 0.1) 0%, rgba(102, 157, 246, 0.05) 100%);
            border-radius: 8px;
        ">
            <div style="margin-bottom: 16px;">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 36px; color: #8ab4f8;"></i>
            </div>
            <div style="font-size: 1.1em; color: #8ab4f8; font-weight: 600; margin-bottom: 8px;">
                채팅 데이터 수집 중
            </div>
            <div style="font-size: 0.9em; color: #aaa;">
                잠시만 기다려주세요...
            </div>
        </div>
    `;
    
    try {
        const context = SillyTavern.getContext();
        const selectedModel = modelSelect.value;
        
        // Fetch all chats for this character
        const response = await fetch('/api/chats/search', {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({
                query: '',
                avatar_url: avatarUrl,
                group_id: null,
            }),
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch character chats');
        }
        
        let characterChats = await response.json();
        
        // Filter by selected chats if manual mode
        if (mode === 'manual' && selectedChatFiles && selectedChatFiles.length > 0) {
            characterChats = characterChats.filter(chat => selectedChatFiles.includes(chat.file_name));
            console.log(`LoreMeter: Manual mode - filtered to ${characterChats.length} selected chats`);
        }
        
        if (characterChats.length === 0) {
            resultDiv.innerHTML = `
                <div style="
                    text-align: center;
                    padding: 40px 20px;
                    background: linear-gradient(135deg, rgba(255, 170, 0, 0.1) 0%, rgba(255, 170, 0, 0.05) 100%);
                    border-radius: 8px;
                    border: 1px solid rgba(255, 170, 0, 0.3);
                ">
                    <div style="margin-bottom: 16px;">
                        <i class="fa-solid fa-folder-open" style="font-size: 40px; color: #ffaa00;"></i>
                    </div>
                    <div style="font-size: 1.1em; color: #ffaa00; font-weight: 600; margin-bottom: 8px;">
                        채팅 없음
                    </div>
                    <div style="font-size: 0.9em; color: #cc9955;">
                        이 캐릭터의 채팅 데이터가 없습니다
                    </div>
                </div>
            `;
            return;
        }
        
        // Get character info
        let character = null;
        if (context?.characters) {
            if (Array.isArray(context.characters)) {
                const charIndex = parseInt(characterId);
                if (!isNaN(charIndex) && charIndex >= 0 && charIndex < context.characters.length) {
                    character = context.characters[charIndex];
                }
            } else {
                character = context.characters[characterId];
            }
        }
        
        // Collect chat contents with smart token management
        const chatSummaries = [];
        
        // Model-specific context limits (conservative estimates for safety)
        const modelContextLimits = {
            'gemini-2.0-flash': 1000000,
            'gemini-2.5-flash': 1000000,
            'gemini-2.5-flash-lite': 1000000,
            'gemini-3-flash-preview': 1000000
        };
        
        const maxContextTokens = modelContextLimits[selectedModel] || 1000000;
        const reserveTokensForPrompt = 2000; // Reserve for system prompt and formatting
        const reserveTokensForResponse = 16000; // Reserve for AI response
        const availableTokens = maxContextTokens - reserveTokensForPrompt - reserveTokensForResponse;
        
        // Calculate tokens per chat dynamically based on number of chats
        const numChats = characterChats.length;
        let tokensPerChat = Math.floor(availableTokens / numChats);
        
        // Set reasonable min/max per chat
        const minTokensPerChat = 20000;
        const maxTokensPerChat = 50000;
        
        if (tokensPerChat < minTokensPerChat) {
            // Too many chats - limit the number of chats
            tokensPerChat = minTokensPerChat;
            const maxChatsToAnalyze = Math.floor(availableTokens / tokensPerChat);
            
            toastr.info(`채팅이 너무 많아 최근 ${maxChatsToAnalyze}개만 분석합니다.`);
            
            // Sort by most recent and take only what we can fit
            characterChats.sort((a, b) => {
                const dateA = extractDateFromSTFormat(a.file_name);
                const dateB = extractDateFromSTFormat(b.file_name);
                if (!dateA) return 1;
                if (!dateB) return -1;
                return dateB - dateA; // Most recent first
            });
            
            characterChats.splice(maxChatsToAnalyze);
        } else if (tokensPerChat > maxTokensPerChat) {
            tokensPerChat = maxTokensPerChat;
        }
        
        resultDiv.innerHTML = `
            <div style="
                text-align: center;
                padding: 40px 20px;
                background: linear-gradient(135deg, rgba(102, 204, 153, 0.1) 0%, rgba(102, 204, 153, 0.05) 100%);
                border-radius: 8px;
            ">
                <div style="margin-bottom: 16px;">
                    <i class="fa-solid fa-download fa-spin" style="font-size: 36px; color: #66cc99;"></i>
                </div>
                <div style="font-size: 1.1em; color: #66cc99; font-weight: 600; margin-bottom: 12px;">
                    ${characterChats.length}개 채팅 로딩 중
                </div>
                <div style="font-size: 0.9em; color: #88ddaa; margin-bottom: 8px;">
                    각 채팅당 ${tokensPerChat.toLocaleString()} 토큰씩 수집
                </div>
                <div style="font-size: 0.85em; color: #666;">
                    모델: ${selectedModel}
                </div>
            </div>
        `;
        
        for (const chat of characterChats) {
            try {
                const fileNameWithoutExt = chat.file_name.replace('.jsonl', '');
                
                const chatResponse = await fetch('/api/chats/get', {
                    method: 'POST',
                    headers: context.getRequestHeaders(),
                    body: JSON.stringify({
                        ch_name: avatarUrl.replace('.png', ''),
                        file_name: fileNameWithoutExt,
                        avatar_url: avatarUrl
                    }),
                });
                
                if (chatResponse.ok) {
                    const chatContent = await chatResponse.json();
                    
                    if (chatContent && Array.isArray(chatContent) && chatContent.length > 0) {
                        // Extract text from messages
                        let chatText = chatContent.map(msg => {
                            const name = msg.name || (msg.is_user ? 'User' : character?.name || 'Character');
                            const text = msg.mes || '';
                            return `${name}: ${text}`;
                        }).join('\n\n');
                        
                        // Truncate to calculated tokens per chat
                        chatText = truncateToTokens(chatText, tokensPerChat);
                        
                        chatSummaries.push({
                            fileName: chat.file_name,
                            content: chatText,
                            messageCount: chatContent.length
                        });
                    }
                }
            } catch (error) {
                console.error(`LoreMeter: Error loading chat ${chat.file_name}:`, error);
            }
        }
        
        if (chatSummaries.length === 0) {
            resultDiv.innerHTML = `
                <div style="
                    text-align: center;
                    padding: 40px 20px;
                    background: linear-gradient(135deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 107, 107, 0.05) 100%);
                    border-radius: 8px;
                    border: 1px solid rgba(255, 107, 107, 0.3);
                ">
                    <div style="margin-bottom: 16px;">
                        <i class="fa-solid fa-file-excel" style="font-size: 40px; color: #ff6b6b;"></i>
                    </div>
                    <div style="font-size: 1.1em; color: #ff6b6b; font-weight: 600; margin-bottom: 8px;">
                        데이터 읽기 실패
                    </div>
                    <div style="font-size: 0.9em; color: #ffaaaa;">
                        채팅 파일을 읽을 수 없습니다
                    </div>
                </div>
            `;
            return;
        }
        
        // Prepare analysis prompt
        const characterName = character?.name || 'Unknown';
        
        // Get saved settings
        const settings = getSettings();
        
        // Initialize prompts if not set
        if (!settings.analysisPrompt3rdPerson) {
            settings.analysisPrompt3rdPerson = getDefault3rdPersonPrompt();
        }
        if (!settings.analysisPrompt1stPerson) {
            settings.analysisPrompt1stPerson = getDefault1stPersonPrompt();
        }
        if (!settings.analysisMode) {
            settings.analysisMode = '1st-person';
        }
        if (settings.includeCharacterDescription === undefined) {
            settings.includeCharacterDescription = true;
        }
        
        // Select prompt based on mode
        let basePrompt = settings.analysisMode === '1st-person' 
            ? settings.analysisPrompt1stPerson 
            : settings.analysisPrompt3rdPerson;
        
        // Replace {characterName} placeholder with actual character name
        basePrompt = basePrompt.replace(/{characterName}/g, characterName);
        
        // Add character description if enabled
        let descriptionSection = '';
        if (settings.includeCharacterDescription !== false && character?.description) {
            descriptionSection = `

---

## 캐릭터 정보

**이름:** ${characterName}

**Description:**
${character.description}

---`;
        }
        
        const analysisPrompt = `여기에 ${characterName}를 주인공으로 만들어진 다양한 평행세계 속 이야기들이 있습니다.

채팅 데이터:

${chatSummaries.map((chat, idx) => `
=== 이야기 #${idx + 1}: ${chat.fileName} (${chat.messageCount}개 메시지) ===
${chat.content}
`).join('\n\n')}

---

${basePrompt}${descriptionSection}`;

        // Calculate approximate token usage
        const estimatedPromptTokens = Math.ceil(analysisPrompt.length / 4);
        const estimatedTotalTokens = estimatedPromptTokens + reserveTokensForResponse;
        
        // Final safety check
        if (estimatedPromptTokens > availableTokens) {
            throw new Error(`프롬프트가 너무 큽니다 (약 ${estimatedPromptTokens.toLocaleString()} 토큰). 채팅 수를 줄여주세요.`);
        }
        
        resultDiv.innerHTML = `
            <div style="
                text-align: center;
                padding: 40px 20px;
                background: linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(167, 139, 250, 0.05) 100%);
                border-radius: 8px;
                border: 1px solid rgba(167, 139, 250, 0.3);
            ">
                <div style="margin-bottom: 16px; position: relative;">
                    <i class="fa-solid fa-envelope fa-beat-fade" style="font-size: 40px; color: #a78bfa;"></i>
                </div>
                <div style="font-size: 1.2em; color: #a78bfa; font-weight: 600; margin-bottom: 12px;">
                    AI 분석 진행 중
                </div>
                <div style="font-size: 1em; color: #c4b5fd; margin-bottom: 16px;">
                    ${chatSummaries.length}개의 채팅 이야기를 분석하고 있습니다
                </div>
                <div style="
                    display: inline-block;
                    padding: 8px 16px;
                    background: rgba(167, 139, 250, 0.2);
                    border-radius: 20px;
                    font-size: 0.85em;
                    color: #b8a3f5;
                    margin-bottom: 12px;
                ">
                    <i class="fa-solid fa-microchip" style="margin-right: 6px;"></i>
                    ${selectedModel}
                </div>
                <div style="font-size: 0.8em; color: #888; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(167, 139, 250, 0.2);">
                    <i class="fa-solid fa-coins" style="margin-right: 4px; color: #a78bfa;"></i>
                    예상: ~${estimatedPromptTokens.toLocaleString()} 입력 + ~${reserveTokensForResponse.toLocaleString()} 출력 토큰
                </div>
            </div>
        `;
        
        // Prepare request parameters
        const messages = [
            { role: 'user', content: analysisPrompt }
        ];
        
        // Add prefill if enabled
        if (settings.usePrefill && settings.prefillText) {
            messages.push({ role: 'assistant', content: settings.prefillText });
        }
        
        const requestParams = {
            model: selectedModel,
            messages: messages,
            temperature: 0.7,
            max_tokens: 16000,
            stream: false,
            chat_completion_source: 'makersuite'
        };
        
        console.log('LoreMeter: Sending character analysis request:', {
            model: selectedModel,
            messageLength: analysisPrompt.length,
            estimatedTokens: estimatedPromptTokens,
            chatCount: chatSummaries.length
        });
        
        // Use SillyTavern's backend API
        const aiResponse = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: {
                ...context.getRequestHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestParams)
        });
        
        if (!aiResponse.ok) {
            let errorMessage = `HTTP ${aiResponse.status}`;
            
            try {
                const errorData = await aiResponse.json();
                if (errorData.error && errorData.error.message) {
                    errorMessage = errorData.error.message;
                } else if (errorData.message) {
                    errorMessage = errorData.message;
                } else {
                    errorMessage = aiResponse.statusText || errorMessage;
                }
            } catch (e) {
                errorMessage = aiResponse.statusText || errorMessage;
            }
            
            // Provide specific error messages based on status code
            switch (aiResponse.status) {
                case 401:
                    throw new Error('Google API 키가 잘못되었거나 권한이 없습니다. API 연결 설정에서 Google AI Studio API 키를 확인해주세요.');
                case 403:
                    throw new Error('Google API 접근이 거부되었습니다. API 연결 설정에서 Google AI Studio API 키와 권한을 확인해주세요.');
                case 429:
                    throw new Error('API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
                case 500:
                    throw new Error('서버 내부 오류가 발생했습니다.');
                case 503:
                    throw new Error('서비스를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.');
                default:
                    throw new Error(errorMessage);
            }
        }
        
        const aiData = await aiResponse.json();
        let analysisResult = aiData.candidates?.[0]?.content?.trim() || 
                            aiData.choices?.[0]?.message?.content?.trim() || 
                            aiData.text?.trim();
        
        if (!analysisResult) {
            throw new Error('AI 응답이 비어있습니다.');
        }
        
        // Add prefill text to the beginning if it was used
        if (settings.usePrefill && settings.prefillText) {
            analysisResult = settings.prefillText + '\n\n' + analysisResult;
        }
        
        // Format and display result with proper styling
        const formattedResult = formatAnalysisResult(analysisResult);
        resultDiv.innerHTML = formattedResult;
        
        // Add double-click event to show full-screen modal
        resultDiv.style.cursor = 'pointer';
        resultDiv.title = '더블클릭하여 전체 화면으로 보기';
        resultDiv.ondblclick = () => showAnalysisResultModal(formattedResult);
        
    } catch (error) {
        console.error('LoreMeter: Character analysis error:', error);
        resultDiv.innerHTML = `
            <div style="
                padding: 24px;
                background: linear-gradient(135deg, rgba(255, 107, 107, 0.15) 0%, rgba(255, 107, 107, 0.05) 100%);
                border-radius: 8px;
                border: 1px solid rgba(255, 107, 107, 0.3);
                text-align: center;
            ">
                <div style="margin-bottom: 16px;">
                    <i class="fa-solid fa-exclamation-triangle" style="font-size: 40px; color: #ff6b6b;"></i>
                </div>
                <div style="font-size: 1.1em; font-weight: 600; color: #ff6b6b; margin-bottom: 12px;">
                    분석 실패
                </div>
                <div style="font-size: 0.9em; color: #ffaaaa; line-height: 1.6; max-width: 400px; margin: 0 auto;">
                    ${error.message}
                </div>
            </div>
        `;
    } finally {
        // Re-enable buttons
        if (analyzeButtonAuto) {
            analyzeButtonAuto.disabled = false;
            analyzeButtonAuto.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i><span>자동 분석</span>';
        }
        if (analyzeButtonManual) {
            analyzeButtonManual.disabled = false;
            analyzeButtonManual.innerHTML = '<i class="fa-solid fa-list-check"></i><span>직접 선택</span>';
        }
    }
}

// Make functions available globally
window.analyzeCharacter = analyzeCharacter;
window.showChatSelectionModal = showChatSelectionModal;
window.showAnalysisResultModal = showAnalysisResultModal;
window.showAnalysisSettingsModal = showAnalysisSettingsModal;

// Initialize character statistics feature
initCharacterStatistics();
