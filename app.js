const input = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const messagesBox = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const historyList = document.getElementById("historyList");

let mode = "general";
let chats = JSON.parse(localStorage.getItem("code_ai_chats") || "[]");
let activeId = null;
let busy = false;

function saveChats() {
    localStorage.setItem("code_ai_chats", JSON.stringify(chats));
}

function newChat() {
    const chat = {
        id: String(Date.now()),
        title: "New conversation",
        messages: []
    };

    chats.unshift(chat);
    activeId = chat.id;
    saveChats();
    render();
}

function currentChat() {
    return chats.find(c => c.id === activeId);
}

function renderHistory() {
    historyList.replaceChildren();

    chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = "history-item" +
            (chat.id === activeId ? " selected" : "");
        item.textContent = chat.title;

        item.onclick = () => {
            activeId = chat.id;
            render();
        };

        historyList.appendChild(item);
    });
}

function addText(parent, text) {
    const regex = /```([\\w+#.-]*)\\n([\\s\\S]*?)```/g;
    let last = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        parent.appendChild(
            document.createTextNode(text.slice(last, match.index))
        );

        const block = document.createElement("div");
        block.className = "code-block";

        const header = document.createElement("div");
        header.className = "code-header";

        const language = document.createElement("span");
        language.textContent = match[1] || "Code";

        const copy = document.createElement("button");
        copy.className = "copy-code";
        copy.textContent = "Copy";

        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = match[2];

        copy.onclick = async () => {
            try {
                await navigator.clipboard.writeText(match[2]);
                copy.textContent = "Copied!";
                setTimeout(() => copy.textContent = "Copy", 1500);
            } catch {
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
        document.createTextNode(text.slice(last))
    );
}

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

function render() {
    const chat = currentChat();

    messagesBox.replaceChildren();
    welcome.style.display = "none";

    if (!chat || chat.messages.length === 0) {
        welcome.style.display = "block";
    }

    if (chat) {
        chat.messages.forEach(m => addMessage(m.role, m.content));
    }

    renderHistory();
    messagesBox.scrollTop = messagesBox.scrollHeight;
}

async function sendMessage(text = input.value.trim()) {
    if (!text || busy) return;

    if (!activeId) newChat();

    const chat = currentChat();

    chat.messages.push({ role: "user", content: text });

    if (chat.title === "New conversation") {
        chat.title = text.slice(0, 35);
    }

    input.value = "";
    busy = true;
    sendButton.disabled = true;
    saveChats();
    render();

    const loading = addMessage("assistant", "CODE AI is thinking...");

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                mode: mode,
                messages: chat.messages.slice(-20)
            })
        });

        const result = await response.json();

        loading.remove();

        if (!response.ok) {
            throw new Error(result.error || "Request failed.");
        }

        chat.messages.push({
            role: "assistant",
            content: result.answer
        });

        saveChats();
        render();

    } catch (error) {
        loading.remove();

        addMessage(
            "assistant",
            "Sorry, I couldn't complete your request: " + error.message
        );
    }

    busy = false;
    sendButton.disabled = false;
    input.focus();
}

document.querySelectorAll(".mode").forEach(button => {
    button.onclick = () => {
        mode = button.dataset.mode;

        document.querySelectorAll(".mode").forEach(b =>
            b.classList.toggle("active", b === button)
        );
    };
});

document.querySelectorAll(".suggestions button").forEach(button => {
    button.onclick = () => sendMessage(button.dataset.prompt);
});

document.getElementById("newChat").onclick = newChat;

document.getElementById("clearChat").onclick = () => {
    if (!activeId) return;

    chats = chats.filter(c => c.id !== activeId);
    activeId = null;
    saveChats();
    render();

    if (chats.length === 0) welcome.style.display = "block";
};

sendButton.onclick = () => sendMessage();

input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
});

document.getElementById("menuButton").onclick = () => {
    document.querySelector(".sidebar").classList.toggle("open");
};

if (chats.length) {
    activeId = chats[0].id;
}

render();
