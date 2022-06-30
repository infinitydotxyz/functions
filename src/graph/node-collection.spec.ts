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

  it('unlinks all nodes and doesn\'t remove nodes from the collection', () => {
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

  it('streamFlow pushes flow to all nodes', () => {
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

  it('adding nodes to the collection while streaming flow results in more flow being pushed', () => {
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


  it('removing a node with flow from the collection, that\'s at its max flow, while streaming flow results in more flow being pushed to other nodes', () => {
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
});
