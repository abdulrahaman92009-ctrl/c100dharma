
"use strict";

// ================================================
// 1. ELEMENTS
// ================================================

const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messagesBox = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const historyList = document.getElementById("historyList");

let mode = "general";
let activeId = null;
let busy = false;

// ================================================
// 2. LOCAL CHAT STORAGE
// ================================================

function loadChats() {
    try {
        const saved = JSON.parse(
            localStorage.getItem("code_ai_chats") || "[]"
        );

        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        console.error("Chat storage error:", error);
        return [];
    }
}

let chats = loadChats();

function saveChats() {
    try {
        localStorage.setItem(
            "code_ai_chats",
            JSON.stringify(chats)
        );
    } catch (error) {
        console.error("Unable to save chats:", error);
    }
}

// ================================================
// 3. CHAT MANAGEMENT
// ================================================

function newChat() {
    const chat = {
        id: String(Date.now()) + Math.random().toString(36).slice(2),
        title: "New conversation",
        messages: []
    };

    chats.unshift(chat);
    activeId = chat.id;

    saveChats();
    render();
}

function currentChat() {
    return chats.find(chat => chat.id === activeId);
}

// ================================================
// 4. CHAT HISTORY
// ================================================

function renderHistory() {
    historyList.replaceChildren();

    chats.forEach(chat => {
        const item = document.createElement("div");

        item.className =
            "history-item" +
            (chat.id === activeId ? " selected" : "");

        item.textContent = chat.title;

        item.onclick = () => {
            activeId = chat.id;
            render();

            document.querySelector(".sidebar").classList.remove("open");
        };

        historyList.appendChild(item);
    });
}

// ================================================
// 5. SAFE TEXT AND CODE DISPLAY
// ================================================

function addText(parent, content) {

    const regex = /```([\w+#.-]*)\n([\s\S]*?)```/g;

    let last = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {

        parent.appendChild(
            document.createTextNode(
                content.slice(last, match.index)
            )
        );

        const languageName = match[1] || "Code";
        const codeText = match[2];

        const block = document.createElement("div");
        block.className = "code-block";

        const header = document.createElement("div");
        header.className = "code-header";

        const language = document.createElement("span");
        language.textContent = languageName;

        const copy = document.createElement("button");
        copy.className = "copy-code";
        copy.textContent = "Copy";

        const pre = document.createElement("pre");
        const code = document.createElement("code");

        code.textContent = codeText;

        copy.onclick = async () => {
            try {
                await navigator.clipboard.writeText(codeText);
                copy.textContent = "Copied!";

                setTimeout(() => {
                    copy.textContent = "Copy";
                }, 1500);

            } catch (error) {
                console.error("Copy error:", error);
                copy.textContent = "Copy unavailable";
            }
        };

        pre.appendChild(code);
        header.append(language, copy);
        block.append(header, pre);

        parent.appendChild(block);

        last = regex.lastIndex;
    }

    parent.appendChild(
        document.createTextNode(content.slice(last))
    );
}

// ================================================
// 6. MESSAGE DISPLAY
// ================================================

function addMessage(role, content) {

    const row = document.createElement("div");
    row.className = "message";

    const avatar = document.createElement("div");
    avatar.className = "avatar";

    avatar.textContent = role === "user" ? "Y" : "C";

    const body = document.createElement("div");
    body.className = "message-content";

    const text = document.createElement("div");
    text.className = "message-text";

    addText(text, content);

    body.appendChild(text);
    row.append(avatar, body);

    messagesBox.appendChild(row);

    return row;
}

// ================================================
// 7. RENDER CHAT
// ================================================

function render() {

    const chat = currentChat();

    messagesBox.replaceChildren();

    welcome.style.display =
        !chat || chat.messages.length === 0
            ? "block"
            : "none";

    if (chat) {
        chat.messages.forEach(message => {
            addMessage(message.role, message.content);
        });
    }

    renderHistory();

    messagesBox.scrollTop = messagesBox.scrollHeight;
}

// ================================================
// 8. SEND MESSAGE TO AI
// ================================================

async function sendMessage(text = input.value.trim()) {

    if (!text || busy) return;

    if (!activeId) {
        newChat();
    }

    const chat = currentChat();

    if (!chat) return;

    chat.messages.push({
        role: "user",
        content: text
    });

    if (chat.title === "New conversation") {
        chat.title = text.slice(0, 35);
    }

    input.value = "";

    busy = true;
    sendButton.disabled = true;

    saveChats();
    render();

    const loading = addMessage(
        "assistant",
        "CODE AI is thinking..."
    );

    try {

        const response = await fetch("/api/chat", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                mode: mode,
                messages: chat.messages.slice(-20)
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error || "Server request failed."
            );
        }

        if (!result.success || typeof result.answer !== "string") {
            throw new Error("Invalid response from CODE AI.");
        }

        chat.messages.push({
            role: "assistant",
            content: result.answer
        });

        saveChats();

        render();

    } catch (error) {

        console.error("CODE AI error:", error);

        loading.remove();

        addMessage(
            "assistant",
            "Sorry, I couldn't complete your request: " +
            error.message
        );

    } finally {

        busy = false;
        sendButton.disabled = false;
        input.focus();
    }
}

// ================================================
// 9. GENERAL AI / CODING AI
// ================================================

document.querySelectorAll(".mode").forEach(button => {

    button.onclick = () => {

        mode = button.dataset.mode;

        document.querySelectorAll(".mode").forEach(item => {
            item.classList.toggle("active", item === button);
        });
    };
});

// ================================================
// 10. SUGGESTED PROMPTS
// ================================================

document.querySelectorAll(".suggestions button").forEach(button => {

    button.onclick = () => {
        sendMessage(button.dataset.prompt);
    };
});

// ================================================
// 11. NEW CONVERSATION
// ================================================

document.getElementById("newChat").onclick = () => {

    if (busy) return;

    newChat();

    document.querySelector(".sidebar").classList.remove("open");
};

// ================================================
// 12. CLEAR CURRENT CHAT
// ================================================

document.getElementById("clearChat").onclick = () => {

    if (busy || !activeId) return;

    chats = chats.filter(chat => chat.id !== activeId);

    activeId = chats.length ? chats[0].id : null;

    saveChats();
    render();
};

// ================================================
// 13. SEND BUTTON
// ================================================

sendButton.onclick = () => {
    sendMessage();
};

// ================================================
// 14. ENTER KEY
// ================================================

input.addEventListener("keydown", event => {

    if (event.key === "Enter" && !event.shiftKey) {

        event.preventDefault();

        sendMessage();
    }
});

// ================================================
// 15. MOBILE SIDEBAR
// ================================================

document.getElementById("menuButton").onclick = () => {

    document.querySelector(".sidebar").classList.toggle("open");
};

// ================================================
// 16. INITIALIZE APPLICATION
// ================================================

if (chats.length > 0) {
    activeId = chats[0].id;
}

render();

console.log("CODE AI frontend initialized successfully.");
