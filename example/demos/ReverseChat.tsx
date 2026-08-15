import { useCallback, useState } from 'react';
import { AsyncList } from '@kinavi/react-async-list';

import { delay, makeMessages, type Message } from '../fakeApi';

const PAGE_SIZE = 12;

/**
 * `isReverse` anchors the list to the bottom, the way a chat transcript behaves:
 * new messages appear at the bottom without moving the view, and scrolling up
 * loads history.
 */
export const ReverseChat = () => {
  const [messages, setMessages] = useState<Message[]>(() =>
    makeMessages(PAGE_SIZE, 'recent')
  );

  const fetchUp = useCallback(async () => {
    await delay(600);
    setMessages((current) => [
      ...makeMessages(PAGE_SIZE, 'history'),
      ...current,
    ]);
  }, []);

  const sendMessage = () => {
    setMessages((current) => [...current, ...makeMessages(1, 'sent')]);
  };

  return (
    <section className="demo themed">
      <div className="demo__header">
        <h2>Reverse (chat) mode</h2>
        <p className="demo__note">
          Bottom-anchored. Scroll up for history; new messages do not shift the
          view. Restyled entirely through CSS custom properties.
        </p>
      </div>
      <div className="demo__toolbar">
        <button type="button" onClick={sendMessage}>
          Send a message
        </button>
        <span className="status">{messages.length} messages</span>
      </div>
      <AsyncList
        className="demo__list"
        isReverse
        fetchUp={fetchUp}
        exitOffset={1}
        classNames={{ track: 'themed-track' }}
      >
        {messages.map((message) => (
          <div
            className={`bubble${message.isOwn ? ' bubble_own' : ''}`}
            key={message.id}
          >
            <div className="bubble__meta">{message.author}</div>
            {message.text}
          </div>
        ))}
      </AsyncList>
    </section>
  );
};
