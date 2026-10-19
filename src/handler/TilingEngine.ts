export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TilingOptions {
	container: Rect;
	gap?: number;
	keepAspectRatio?: boolean;
	aspectRatio?: number; // default 16/9
}

export type TilingLayoutMode = "dwindle" | "grid" | "master-stack" | "team-split";

export default class TilingEngine {
	/**
	 * Computes dynamic tile rectangles based on the count of active windows and chosen mode.
	 */
	static calculateLayout(
		activeCount: number,
		mode: TilingLayoutMode = "dwindle",
		options: TilingOptions = {
			container: { x: 0, y: 100, width: 1920, height: 720 },
			gap: 8,
			keepAspectRatio: false,
			aspectRatio: 16 / 9,
		},
	): Rect[] {
		if (activeCount <= 0) return [];

		const gap = options.gap ?? 8;
		const container = options.container;

		let rawRects: Rect[] = [];

		switch (mode) {
			case "dwindle":
				rawRects = this.calculateDwindle(activeCount, container, gap);
				break;
			case "master-stack":
				rawRects = this.calculateMasterStack(activeCount, container, gap);
				break;
			case "team-split":
				rawRects = this.calculateTeamSplit(activeCount, container, gap);
				break;
			case "grid":
			default:
				rawRects = this.calculateGrid(activeCount, container, gap);
				break;
		}

		if (options.keepAspectRatio && options.aspectRatio) {
			return rawRects.map((r) =>
				this.fitAspectRatio(r, options.aspectRatio ?? 16 / 9),
			);
		}

		return rawRects;
	}

	/**
	 * Hyprland / Dwindle style layout: recursively splits the largest remaining space
	 * alternating between horizontal and vertical splits.
	 */
	private static calculateDwindle(
		count: number,
		container: Rect,
		gap: number,
	): Rect[] {
		if (count === 1) {
			return [{ ...container }];
		}

		const rects: Rect[] = [];
		let currentArea: Rect = { ...container };

		for (let i = 0; i < count; i++) {
			if (i === count - 1) {
				rects.push(currentArea);
				break;
			}

			// Alternate split direction: if wider than tall, split horizontally (side by side), else vertically
			const splitHorizontal = currentArea.width >= currentArea.height;

			if (splitHorizontal) {
				const width = Math.floor((currentArea.width - gap) / 2);
				rects.push({
					x: currentArea.x,
					y: currentArea.y,
					width,
					height: currentArea.height,
				});
				currentArea = {
					x: currentArea.x + width + gap,
					y: currentArea.y,
					width: currentArea.width - width - gap,
					height: currentArea.height,
				};
			} else {
				const height = Math.floor((currentArea.height - gap) / 2);
				rects.push({
					x: currentArea.x,
					y: currentArea.y,
					width: currentArea.width,
					height,
				});
				currentArea = {
					x: currentArea.x,
					y: currentArea.y + height + gap,
					width: currentArea.width,
					height: currentArea.height - height - gap,
				};
			}
		}

		return rects;
	}

	/**
	 * Balanced Grid layout: calculates optimal rows and columns to fill the container.
	 */
	private static calculateGrid(
		count: number,
		container: Rect,
		gap: number,
	): Rect[] {
		if (count === 1) return [{ ...container }];
		if (count === 2) {
			const w = Math.floor((container.width - gap) / 2);
			return [
				{ x: container.x, y: container.y, width: w, height: container.height },
				{
					x: container.x + w + gap,
					y: container.y,
					width: container.width - w - gap,
					height: container.height,
				},
			];
		}

		// Calculate columns and rows based on aspect ratio
		const cols = Math.ceil(Math.sqrt(count * (container.width / container.height)));
		const rows = Math.ceil(count / cols);

		const rects: Rect[] = [];
		const cellHeight = Math.floor((container.height - gap * (rows - 1)) / rows);

		let placed = 0;
		for (let r = 0; r < rows; r++) {
			const itemsInThisRow = Math.min(cols, count - placed);
			const cellWidth = Math.floor(
				(container.width - gap * (itemsInThisRow - 1)) / itemsInThisRow,
			);
			const rowY = container.y + r * (cellHeight + gap);

			for (let c = 0; c < itemsInThisRow; c++) {
				rects.push({
					x: container.x + c * (cellWidth + gap),
					y: rowY,
					width: cellWidth,
					height: cellHeight,
				});
				placed++;
			}
		}

		return rects;
	}

	/**
	 * Master-Stack layout: 1 primary client on the left, remaining clients stacked on the right.
	 */
	private static calculateMasterStack(
		count: number,
		container: Rect,
		gap: number,
	): Rect[] {
		if (count <= 1) return this.calculateGrid(count, container, gap);

		const masterWidth = Math.floor((container.width - gap) * 0.6);
		const stackWidth = container.width - masterWidth - gap;
		const stackCount = count - 1;
		const stackHeight = Math.floor(
			(container.height - gap * (stackCount - 1)) / stackCount,
		);

		const rects: Rect[] = [
			{
				x: container.x,
				y: container.y,
				width: masterWidth,
				height: container.height,
			},
		];

		const stackX = container.x + masterWidth + gap;
		for (let i = 0; i < stackCount; i++) {
			rects.push({
				x: stackX,
				y: container.y + i * (stackHeight + gap),
				width: stackWidth,
				height: stackHeight,
			});
		}

		return rects;
	}

	/**
	 * Team-Split layout: Splits half for Team Left and half for Team Right (e.g. for osu! Tournaments).
	 */
	private static calculateTeamSplit(
		count: number,
		container: Rect,
		gap: number,
	): Rect[] {
		if (count <= 1) return [{ ...container }];

		const halfWidth = Math.floor((container.width - gap) / 2);
		const leftCount = Math.ceil(count / 2);
		const rightCount = Math.floor(count / 2);

		const leftContainer: Rect = {
			x: container.x,
			y: container.y,
			width: halfWidth,
			height: container.height,
		};

		const rightContainer: Rect = {
			x: container.x + halfWidth + gap,
			y: container.y,
			width: container.width - halfWidth - gap,
			height: container.height,
		};

		const leftRects = this.calculateGrid(leftCount, leftContainer, gap);
		const rightRects = this.calculateGrid(rightCount, rightContainer, gap);

		return [...leftRects, ...rightRects];
	}

	/**
	 * Inscribes a rectangle keeping an exact aspect ratio centered within the bounding box.
	 */
	private static fitAspectRatio(bounds: Rect, targetRatio: number): Rect {
		const currentRatio = bounds.width / bounds.height;

		if (currentRatio > targetRatio) {
			// Bounds are wider than needed -> fit height and center horizontally
			const width = Math.floor(bounds.height * targetRatio);
			const x = bounds.x + Math.floor((bounds.width - width) / 2);
			return { x, y: bounds.y, width, height: bounds.height };
		} else {
			// Bounds are taller than needed -> fit width and center vertically
			const height = Math.floor(bounds.width / targetRatio);
			const y = bounds.y + Math.floor((bounds.height - height) / 2);
			return { x: bounds.x, y, width: bounds.width, height };
		}
	}
}
