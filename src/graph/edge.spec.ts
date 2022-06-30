import { Edge } from './edge';
import { Node } from './node';

function getConnection(maxFlow: number) {
  const edge = new Edge<any>();
  const data = {};
  const from = new Node(data, maxFlow);
  const to = new Node(data, maxFlow, true);
  edge.link(from, to);
  return { edge, from, to };
}

describe('edge', () => {
  it('should have zero flow when not connected', () => {
    const edge = new Edge();
    expect(edge.flow).toBe(0);
  });

  it('should be able to link two edges', () => {
    const maxFlow = 1;
    const { edge, from, to } = getConnection(maxFlow);

    expect(edge.fromNode).toBe(from);
    expect(edge.toNode).toBe(to);

    const isEdgeInFromNodeOutgoingEdges = from.outgoingEdges.includes(edge);
    const isEdgeInFromNodeIncomingEdges = from.incomingEdges.includes(edge);
    const isEdgeInToNodeIncomingEdges = to.incomingEdges.includes(edge);
    const isEdgeInToNodeOutgoingEdges = to.outgoingEdges.includes(edge);

    expect(isEdgeInFromNodeOutgoingEdges).toBe(true);
    expect(isEdgeInFromNodeIncomingEdges).toBe(false);

    expect(isEdgeInToNodeIncomingEdges).toBe(true);
    expect(isEdgeInToNodeOutgoingEdges).toBe(false);
  });

  it('should push flow when flow is pushed by the to node', () => {
    const maxFlow = 1;
    const { edge, from, to } = getConnection(maxFlow);

    expect(edge.flow).toBe(0);

    const { flowPushed } = from.pushFlow(maxFlow);
    expect(flowPushed).toBe(maxFlow);
    expect(from.flow).toBe(maxFlow);
    expect(edge.flow).toBe(maxFlow);
    expect(to.flow).toBe(maxFlow);
  });

  it('should not be able to push more than maxFlow flow', () => {
    const maxFlow = 1;
    const { edge, from, to } = getConnection(maxFlow);

    const { flowPushed } = from.pushFlow(maxFlow + 1);
    expect(from.flow).toBe(maxFlow);
    expect(edge.flow).toBe(maxFlow);
    expect(to.flow).toBe(maxFlow);
    expect(flowPushed).toBe(maxFlow);
  });

  it('should not be connected and not have flow when unlinked', () => {
    const maxFlow = 1;
    const { edge, from, to } = getConnection(maxFlow);
    from.pushFlow(maxFlow);

    expect(edge.flow).toBe(maxFlow);

    edge.unlink();

    expect(edge.flow).toBe(0);
    expect(edge.toNode).toBeUndefined();
    expect(edge.fromNode).toBeUndefined();
    expect(edge.maxFlow).toBe(0);
  });

  it('should set the maxFlow based on the maxFlow of the to and from nodes', () => {
    const maxFlow = 1;
    const { edge, from, to } = getConnection(maxFlow);

    expect(edge.maxFlow).toBe(maxFlow);
    from.maxFlow = maxFlow + 1;

    expect(to.maxFlow).toBe(maxFlow);
    expect(from.maxFlow).toBeGreaterThan(maxFlow);
    expect(edge.maxFlow).toBe(maxFlow);

    to.maxFlow = maxFlow + 1;
    const newMaxFlow = maxFlow + 1;
    expect(to.maxFlow).toBe(newMaxFlow);
    expect(from.maxFlow).toBeGreaterThanOrEqual(newMaxFlow);
    expect(edge.maxFlow).toBe(newMaxFlow);
  })
});
