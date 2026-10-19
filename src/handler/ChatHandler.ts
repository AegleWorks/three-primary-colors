import type ZEngine from "@fukutotojido/z-engine";
import type Test from "../Test";

interface Chat {
	team: string;
	time: string;
	name: string;
	messageBody: string;
}

export default class ChatHandler {
	private lastChatCount = 0;

	static map = [
		{
			id: "chatInner",
			key: "tourney.manager.chat.length",
		},
	];

	constructor(engine: ZEngine, test?: Test) {
		for (const value of ChatHandler.map) {
			const element: HTMLElement | null = document.querySelector(
				`#${value.id}`,
			);

			engine.register(value.key, (_, __, data) => {
				if (element === null || test?.testMode) return;

				switch (value.id) {
					case "chatInner": {
						const chats: Chat[] = data.tourney.manager.chat;
						this.createChats(element, chats);
						break;
					}
					default: {
						break;
					}
				}
			});
		}
	}

	createChats(element: HTMLElement, chats: Chat[]) {
		if (!chats || chats.length === 0) {
			element.innerHTML = "";
			this.lastChatCount = 0;
			return;
		}

		if (chats.length < this.lastChatCount) {
			element.innerHTML = "";
			this.lastChatCount = 0;
		}

		const newChats = chats.slice(this.lastChatCount);
		if (newChats.length > 0) {
			const fragment = document.createDocumentFragment();
			for (const chat of newChats) {
				fragment.appendChild(this.createChat(chat));
			}
			element.appendChild(fragment);
			this.lastChatCount = chats.length;
			element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
		}
	}

	createChat({
		team,
		time,
		name,
		messageBody,
	}: {
		team: string;
		time: string;
		name: string;
		messageBody: string;
	}) {
		const teamColor = {
			bot: "custom-side-bot",
			left: "custom-side-left",
			right: "custom-side-right",
		};
		const element = document.createElement("div");
		element.className = "w-full flex items-start gap-5";

		const timeElement = document.createElement("div");
		timeElement.className = "w-[50px] text-right";
		timeElement.innerText = time;

		const nameElement = document.createElement("div");
		nameElement.className = "w-[120px] font-bold";
		if (teamColor[team as keyof typeof teamColor]) {
			nameElement.classList.add(
				`text-${teamColor[team as keyof typeof teamColor]}`,
			);
		}
		nameElement.innerText = name;

		const messageElement = document.createElement("div");
		messageElement.className = "flex-1";
		messageElement.innerText = messageBody;

		element.append(timeElement, nameElement, messageElement);
		return element;
	}
}
