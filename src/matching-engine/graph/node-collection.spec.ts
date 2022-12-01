import { NodeCollection } from './node-collection';
import { Node } from './node';
import { Edge } from './edge';

describe('node collection', () => {
  it('adds and remove nodes', () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 2);
    const node = new Node({}, 1, false);
    nodeCollection.add(node);
    expect(nodeCollection.nodes.size).toBe(1);

    nodeCollection.remove(node);
    expect(nodeCollection.nodes.size).toBe(0);
  });

  it("unlinks all nodes and doesn't remove nodes from the collection", () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 2);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);

    nodeCollection.add(nodeFromOne);
    nodeCollection.add(nodeFromTwo);

    expect(nodeCollection.outgoingEdges.length).toBe(2);
    expect(nodeCollection.nodes.size).toBe(2);

    nodeCollection.unlink();
    expect(nodeCollection.outgoingEdges.length).toBe(0);
    expect(nodeCollection.nodes.size).toBe(2);
  });

  it('pushed flow to all nodes via streamFlow', () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 2);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);

    nodeCollection.add(nodeFromOne);
    nodeCollection.add(nodeFromTwo);

    const iterator = nodeCollection.streamFlow();

    const first = iterator.next().value;
    if (first) {
      const { flowPushed, totalFlowPushed } = first;
      expect(flowPushed).toBe(2);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }

    const second = iterator.next().value;
    if (second) {
      const { flowPushed, totalFlowPushed } = second;
      expect(flowPushed).toBe(0);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }
  });

  it('continues to push flow to new nodes that are added to the collection', () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 4);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);

    nodeCollection.add(nodeFromOne);
    nodeCollection.add(nodeFromTwo);

    const iterator = nodeCollection.streamFlow();

    const first = iterator.next().value;
    if (first) {
      const { flowPushed, totalFlowPushed } = first;
      expect(flowPushed).toBe(2);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }

    const second = iterator.next().value;
    if (second) {
      const { flowPushed, totalFlowPushed } = second;
      expect(flowPushed).toBe(0);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }

    const nodeFromThree = new Node({}, 1, false);
    const nodeToThree = new Node({}, 1, true);
    const edgeThree = new Edge();
    edgeThree.link(nodeFromThree, nodeToThree);

    nodeCollection.add(nodeFromThree);

    const third = iterator.next().value;
    if (third) {
      const { flowPushed, totalFlowPushed } = third;
      expect(flowPushed).toBe(1);
      expect(totalFlowPushed).toBe(3);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
      expect(edgeThree.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }
  });

  it("pushes flow to the next nodes when a node that previously had flow is removed from the collection and the collection was at it's max flow", () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 2);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);
    const nodeFromThree = new Node({}, 1, false);
    const nodeToThree = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    const edgeThree = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);
    edgeThree.link(nodeFromThree, nodeToThree);

    nodeCollection.add(nodeFromOne);
    nodeCollection.add(nodeFromTwo);
    nodeCollection.add(nodeFromThree);

    const iterator = nodeCollection.streamFlow();

    const first = iterator.next().value;
    if (first) {
      const { flowPushed, totalFlowPushed } = first;
      expect(flowPushed).toBe(2);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }

    const second = iterator.next().value;
    if (second) {
      const { flowPushed, totalFlowPushed } = second;
      expect(flowPushed).toBe(0);
      expect(totalFlowPushed).toBe(2);
      expect(edgeOne.flow).toBe(1);
      expect(edgeTwo.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }

    nodeCollection.remove(nodeFromOne);

    const third = iterator.next().value;
    if (third) {
      const { flowPushed, totalFlowPushed } = third;
      expect(flowPushed).toBe(1);
      expect(totalFlowPushed).toBe(3);
      expect(edgeTwo.flow).toBe(1);
      expect(edgeThree.flow).toBe(1);
    } else {
      expect(false).toBe(true);
    }
  });

  it('maintains the order of nodes in which they were added to the collection', () => {
    const data = {};
    const nodeCollection = new NodeCollection(data, 2);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);
    const nodeFromThree = new Node({}, 1, false);
    const nodeToThree = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    const edgeThree = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);
    edgeThree.link(nodeFromThree, nodeToThree);

    nodeCollection.add(nodeFromOne);
    nodeCollection.add(nodeFromTwo);
    nodeCollection.add(nodeFromThree);

    const nodes = [...nodeCollection.nodes];
    expect(nodes[0]).toBe(nodeFromOne);
    expect(nodes[1]).toBe(nodeFromTwo);
    expect(nodes[2]).toBe(nodeFromThree);

    nodeCollection.remove(nodeFromOne);

    const nodesAfterRemoval = [...nodeCollection.nodes];
    expect(nodesAfterRemoval[0]).toBe(nodeFromTwo);
    expect(nodesAfterRemoval[1]).toBe(nodeFromThree);

    nodeCollection.add(nodeFromOne);

    const nodesAfterAddition = [...nodeCollection.nodes];
    expect(nodesAfterAddition[0]).toBe(nodeFromTwo);
    expect(nodesAfterAddition[1]).toBe(nodeFromThree);
    expect(nodesAfterAddition[2]).toBe(nodeFromOne);
  });

  it('groups edges by node', () => {
    const data = {};
    const outgoingNodeCollection = new NodeCollection(data, 2);
    const incomingNodeCollection = new NodeCollection(data, 2);
    const nodeFromOne = new Node({}, 1, false);
    const nodeFromTwo = new Node({}, 1, false);
    const nodeToOne = new Node({}, 1, true);
    const nodeToTwo = new Node({}, 1, true);
    const nodeFromThree = new Node({}, 1, false);
    const nodeToThree = new Node({}, 1, true);

    const edgeOne = new Edge();
    const edgeTwo = new Edge();
    const edgeThree = new Edge();

    edgeOne.link(nodeFromOne, nodeToOne);
    edgeTwo.link(nodeFromTwo, nodeToTwo);
    edgeThree.link(nodeFromThree, nodeToThree);

    outgoingNodeCollection.add(nodeFromOne);
    outgoingNodeCollection.add(nodeFromTwo);
    outgoingNodeCollection.add(nodeFromThree);

    incomingNodeCollection.add(nodeToOne);
    incomingNodeCollection.add(nodeToTwo);
    incomingNodeCollection.add(nodeToThree);

    const outgoingEdges = outgoingNodeCollection.outgoingEdges;
    expect(outgoingEdges.length).toBe(3);
    expect(outgoingEdges[0]).toBe(edgeOne);
    expect(outgoingEdges[1]).toBe(edgeTwo);
    expect(outgoingEdges[2]).toBe(edgeThree);

    const incomingEdged = incomingNodeCollection.incomingEdges;
    expect(incomingEdged.length).toBe(3);
    expect(incomingEdged[0]).toBe(edgeOne);
    expect(incomingEdged[1]).toBe(edgeTwo);
    expect(incomingEdged[2]).toBe(edgeThree);
  });
});
