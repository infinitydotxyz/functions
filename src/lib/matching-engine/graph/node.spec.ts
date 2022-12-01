import { Edge } from './edge';
import { Node } from './node';

describe('node', () => {
  it('should be initialized without flow or connections', () => {
    const maxFlow = 1;
    const node = new Node({}, maxFlow, false);

    expect(node.incomingEdgeFlow).toBe(0);
    expect(node.incomingEdges.length).toBe(0);
    expect(node.outgoingEdgeFlow).toBe(0);
    expect(node.outgoingEdges.length).toBe(0);
  });

  it('should be able to add an outgoing edge', () => {
    const maxFlow = 1;
    const fromNode = new Node({}, maxFlow, false);
    const toNode = new Node({}, maxFlow, true);
    const edge = new Edge();
    edge.link(fromNode, toNode);

    expect(fromNode.incomingEdgeFlow).toBe(0);
    expect(fromNode.incomingEdges.length).toBe(0);
    expect(fromNode.outgoingEdgeFlow).toBe(0);
    expect(fromNode.outgoingEdges.length).toBe(1);

    expect(toNode.incomingEdgeFlow).toBe(0);
    expect(toNode.incomingEdges.length).toBe(1);
    expect(toNode.outgoingEdgeFlow).toBe(0);
    expect(toNode.outgoingEdges.length).toBe(0);
  });

  it('should be able to push flow to an outgoing node', () => {
    const maxFlow = 1;
    const fromNode = new Node({}, maxFlow, false);
    const toNode = new Node({}, maxFlow, true);
    const edge = new Edge();
    edge.link(fromNode, toNode);

    const { flowPushed } = fromNode.pushFlow(maxFlow);

    expect(flowPushed).toBe(maxFlow);

    expect(fromNode.incomingEdgeFlow).toBe(0);
    expect(fromNode.incomingEdges.length).toBe(0);
    expect(fromNode.outgoingEdgeFlow).toBe(maxFlow);
    expect(fromNode.outgoingEdges.length).toBe(1);
    expect(toNode.incomingEdgeFlow).toBe(maxFlow);
    expect(toNode.incomingEdges.length).toBe(1);
  });

  it('should not be able to push more than the maxFlow of the from node', () => {
    const maxFlow = 1;
    const fromNode = new Node({}, maxFlow, false);
    const toNode = new Node({}, maxFlow + 1, true);
    const edge = new Edge();
    edge.link(fromNode, toNode);

    const { flowPushed } = fromNode.pushFlow(maxFlow + 1);

    expect(flowPushed).toBe(maxFlow);
    expect(fromNode.outgoingEdgeFlow).toBe(maxFlow);
    expect(toNode.incomingEdgeFlow).toBe(maxFlow);
  });

  it('should not be able to push more than the maxFlow of the to node', () => {
    const maxFlow = 1;
    const fromNode = new Node({}, maxFlow + 1, false);
    const toNode = new Node({}, maxFlow, true);
    const edge = new Edge();
    edge.link(fromNode, toNode);

    const { flowPushed } = fromNode.pushFlow(maxFlow + 1);

    expect(flowPushed).toBe(maxFlow);
    expect(fromNode.outgoingEdgeFlow).toBe(maxFlow);
    expect(toNode.incomingEdgeFlow).toBe(maxFlow);
  });

  it('should keep the same order of edges that they were added in', () => {
    const maxFlow = 2;
    const fromNode = new Node({}, maxFlow, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    expect(fromNode.outgoingEdges.length).toBe(2);
    expect(fromNode.outgoingEdges[0].toNode).toBe(toNodeOne);
    expect(fromNode.outgoingEdges[1].toNode).toBe(toNodeTwo);

    edgeOne.unlink();
    expect(fromNode.outgoingEdges.length).toBe(1);

    edgeOne.link(fromNode, toNodeOne);
    expect(fromNode.outgoingEdges.length).toBe(2);
    expect(fromNode.outgoingEdges[0].toNode).toBe(toNodeTwo);
    expect(fromNode.outgoingEdges[1].toNode).toBe(toNodeOne);
  });

  it('should push flow to nodes in the order they were linked', () => {
    const maxFlow = 2;
    const fromNode = new Node({}, maxFlow, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    const { flowPushed } = fromNode.pushFlow(maxFlow);

    expect(flowPushed).toBe(maxFlow);
    expect(edgeOne.flow).toBe(maxFlow);
    expect(edgeTwo.flow).toBe(0);
  });

  it('should push flow to multiple nodes if the first node cannot take all flow', () => {
    const maxFlow = 2;
    const fromNode = new Node({}, 3, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    const flowToPush = 3;
    const { flowPushed } = fromNode.pushFlow(flowToPush);

    expect(flowPushed).toBe(flowToPush);
    expect(edgeOne.flow).toBe(maxFlow);
    expect(edgeTwo.flow).toBe(flowToPush - maxFlow);
  });

  it('should not be able to push more flow than the sum of its edges max flows', () => {
    const maxFlow = 2;
    const fromNode = new Node({}, Number.MAX_SAFE_INTEGER, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    const flowToPush = 1000;
    const { flowPushed } = fromNode.pushFlow(flowToPush);

    expect(flowPushed).toBe(maxFlow * 2);
    expect(edgeOne.flow).toBe(maxFlow);
    expect(edgeTwo.flow).toBe(maxFlow);
    expect(fromNode.flow).toBe(maxFlow * 2);
    expect(toNodeOne.flow).toBe(maxFlow);
    expect(toNodeTwo.flow).toBe(maxFlow);
  });

  it('should remove edges and adjust flow accordingly', () => {
    const maxFlow = 2;
    const fromNode = new Node<any>({}, maxFlow * 2, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    fromNode.pushFlow(maxFlow * 2);

    expect(fromNode.outgoingEdges.length).toBe(2);
    expect(fromNode.flow).toBe(maxFlow * 2);
    expect(toNodeOne.flow).toBe(maxFlow);
    expect(toNodeTwo.flow).toBe(maxFlow);

    fromNode.remove(edgeOne);

    expect(fromNode.outgoingEdges.length).toBe(1);
    expect(fromNode.flow).toBe(maxFlow);
  });

  it('should unlink all edges and adjust flow accordingly', () => {
    const maxFlow = 2;
    const fromNode = new Node<any>({}, maxFlow * 2, false);
    const toNodeOne = new Node({}, maxFlow, true);
    const toNodeTwo = new Node({}, maxFlow, true);
    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    edgeOne.link(fromNode, toNodeOne);
    edgeTwo.link(fromNode, toNodeTwo);

    fromNode.pushFlow(maxFlow * 2);

    expect(fromNode.outgoingEdges.length).toBe(2);
    expect(fromNode.flow).toBe(maxFlow * 2);
    expect(toNodeOne.flow).toBe(maxFlow);
    expect(toNodeTwo.flow).toBe(maxFlow);

    fromNode.unlink();

    expect(fromNode.outgoingEdges.length).toBe(0);
    expect(fromNode.flow).toBe(0);
    expect(toNodeOne.flow).toBe(0);
    expect(toNodeTwo.flow).toBe(0);
    expect(toNodeOne.incomingEdges.length).toBe(0);
    expect(toNodeTwo.incomingEdges.length).toBe(0);
  });
});
