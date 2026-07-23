export default function DebugHitboxes({ hitboxes }) {
  return (
    <>
      {hitboxes.map((box, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: box.x,
            top: box.y,
            width: box.width,
            height: box.height,
            border: "2px solid red",
            boxSizing: "border-box",
            pointerEvents: "none",
            zIndex: 9999,
          }}
        />
      ))}
    </>
  );
}
