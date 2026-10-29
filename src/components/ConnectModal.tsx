import { useMemo } from 'react';
import { ArrowLeft, ArrowRight, Unlink } from 'lucide-react';
import { currentBoard, useStore } from '../store';
import { canConnect } from '../graph';
import { nodeLabel } from '../nodeLabel';
import type { BoardNode } from '../types';
import { IconButton, Modal } from './ui';

export function ConnectModal({
  sourceNode,
  onClose,
}: {
  sourceNode: BoardNode;
  onClose: () => void;
}) {
  const state = useStore();
  const board = currentBoard(state);

  // Targets where sourceNode can send context to: sourceNode -> target
  const sendTargets = useMemo(
    () =>
      board.nodes.filter(
        (n) =>
          n.id !== sourceNode.id &&
          n.type !== 'group' &&
          canConnect(sourceNode.id, n.id, board.edges),
      ),
    [board.nodes, board.edges, sourceNode.id],
  );

  // Sources where sourceNode can receive context from: source -> sourceNode
  const receiveSources = useMemo(
    () =>
      board.nodes.filter(
        (n) =>
          n.id !== sourceNode.id &&
          n.type !== 'group' &&
          canConnect(n.id, sourceNode.id, board.edges),
      ),
    [board.nodes, board.edges, sourceNode.id],
  );

  // Existing connections
  const outboundEdges = board.edges.filter((e) => e.source === sourceNode.id);
  const inboundEdges = board.edges.filter((e) => e.target === sourceNode.id);

  const handleConnect = (fromId: string, toId: string) => {
    state.connect(fromId, toId);
    const fromNode = board.nodes.find((n) => n.id === fromId);
    const toNode = board.nodes.find((n) => n.id === toId);
    if (fromNode && toNode) {
      useStore.setState({
        toast: `Connected “${nodeLabel(fromNode)}” → “${nodeLabel(toNode)}”`,
      });
    }
    onClose();
  };

  const handleDisconnect = (edgeId: string) => {
    state.checkpoint();
    state.edgesChange([{ type: 'remove', id: edgeId }]);
    useStore.setState({ toast: 'Connection removed.' });
  };

  return (
    <Modal
      title={`Connect “${nodeLabel(sourceNode)}”`}
      onClose={onClose}
      transient={true}
      className="connect-cards-modal"
    >
      <div className="connect-modal-body">
        <p className="connect-modal-description">
          Connecting cards allows context (messages and notes) to flow from parent to child,
          enabling branching or shared memory.
        </p>

        {/* Existing Connections */}
        {(outboundEdges.length > 0 || inboundEdges.length > 0) && (
          <div className="connect-modal-section">
            <h4 className="connect-modal-section-title">Current Connections</h4>
            <ul className="connect-modal-list">
              {outboundEdges.map((e) => {
                const target = board.nodes.find((n) => n.id === e.target);
                if (!target) return null;
                return (
                  <li key={e.id} className="connect-modal-item">
                    <div className="connect-modal-item-info">
                      <span className="connect-direction-badge">Sends context to</span>
                      <strong className="connect-modal-item-title">{nodeLabel(target)}</strong>
                    </div>
                    <IconButton
                      label={`Disconnect from ${nodeLabel(target)}`}
                      onClick={() => handleDisconnect(e.id)}
                    >
                      <Unlink size={16} />
                    </IconButton>
                  </li>
                );
              })}
              {inboundEdges.map((e) => {
                const src = board.nodes.find((n) => n.id === e.source);
                if (!src) return null;
                return (
                  <li key={e.id} className="connect-modal-item">
                    <div className="connect-modal-item-info">
                      <span className="connect-direction-badge">Receives context from</span>
                      <strong className="connect-modal-item-title">{nodeLabel(src)}</strong>
                    </div>
                    <IconButton
                      label={`Disconnect from ${nodeLabel(src)}`}
                      onClick={() => handleDisconnect(e.id)}
                    >
                      <Unlink size={16} />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Send context to other cards */}
        <div className="connect-modal-section">
          <h4 className="connect-modal-section-title">Send context to (as parent)</h4>
          {sendTargets.length === 0 ? (
            <p className="connect-modal-empty">
              No eligible target cards available without creating a cycle.
            </p>
          ) : (
            <ul className="connect-modal-list">
              {sendTargets.map((target) => (
                <li key={target.id} className="connect-modal-item">
                  <div className="connect-modal-item-info">
                    <strong className="connect-modal-item-title">{nodeLabel(target)}</strong>
                    <span className="connect-modal-item-sub">
                      {target.type === 'note' ? 'Note' : 'Conversation'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="connect-modal-btn"
                    onClick={() => handleConnect(sourceNode.id, target.id)}
                  >
                    Connect <ArrowRight size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Receive context from other cards */}
        <div className="connect-modal-section">
          <h4 className="connect-modal-section-title">Receive context from (as child)</h4>
          {receiveSources.length === 0 ? (
            <p className="connect-modal-empty">
              No eligible source cards available without creating a cycle.
            </p>
          ) : (
            <ul className="connect-modal-list">
              {receiveSources.map((src) => (
                <li key={src.id} className="connect-modal-item">
                  <div className="connect-modal-item-info">
                    <strong className="connect-modal-item-title">{nodeLabel(src)}</strong>
                    <span className="connect-modal-item-sub">
                      {src.type === 'note' ? 'Note' : 'Conversation'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="connect-modal-btn"
                    onClick={() => handleConnect(src.id, sourceNode.id)}
                  >
                    <ArrowLeft size={14} aria-hidden /> Connect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
