import { Position } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { getFloatingConnection } from "./floating-edge";

describe("getFloatingConnection", () => {
  it("connects side-by-side nodes from their facing sides", () => {
    const connection = getFloatingConnection(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 300, y: 0, width: 100, height: 80 },
    );

    expect(connection).toEqual({
      source: { x: 100, y: 40, position: Position.Right },
      target: { x: 300, y: 40, position: Position.Left },
    });
  });

  it("connects vertically stacked nodes from bottom to top", () => {
    const connection = getFloatingConnection(
      { x: 0, y: 0, width: 100, height: 80 },
      { x: 0, y: 200, width: 100, height: 80 },
    );

    expect(connection).toEqual({
      source: { x: 50, y: 80, position: Position.Bottom },
      target: { x: 50, y: 200, position: Position.Top },
    });
  });

  it("reaches exact corners for diagonal square nodes", () => {
    const connection = getFloatingConnection(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 200, y: 200, width: 100, height: 100 },
    );

    expect(connection).toEqual({
      source: { x: 100, y: 100, position: Position.Right },
      target: { x: 200, y: 200, position: Position.Left },
    });
  });

  it("uses each node's own dimensions for unequal rectangles", () => {
    const connection = getFloatingConnection(
      { x: 0, y: 0, width: 200, height: 100 },
      { x: 300, y: 200, width: 100, height: 200 },
    );

    expect(connection).toEqual({
      source: { x: 150, y: 100, position: Position.Bottom },
      target: { x: 300, y: 250, position: Position.Left },
    });
  });

  it("updates endpoints when a node moves", () => {
    const source = { x: 0, y: 0, width: 100, height: 100 };
    const beside = getFloatingConnection(source, {
      x: 200,
      y: 0,
      width: 100,
      height: 100,
    });
    const below = getFloatingConnection(source, {
      x: 0,
      y: 200,
      width: 100,
      height: 100,
    });

    expect(beside?.source.position).toBe(Position.Right);
    expect(below?.source.position).toBe(Position.Bottom);
  });

  it("uses a deterministic horizontal fallback for coincident centers", () => {
    const connection = getFloatingConnection(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 25, y: 25, width: 50, height: 50 },
    );

    expect(connection).toEqual({
      source: { x: 100, y: 50, position: Position.Right },
      target: { x: 25, y: 50, position: Position.Left },
    });
  });

  it("rejects missing or zero geometry", () => {
    expect(
      getFloatingConnection(
        { x: 0, y: 0, width: 0, height: 100 },
        { x: 200, y: 0, width: 100, height: 100 },
      ),
    ).toBeNull();
  });
});
