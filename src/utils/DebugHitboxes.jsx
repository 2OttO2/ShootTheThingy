export default function DebugHitboxes({ hitboxes }) {
  return (
    <>
      {hitboxes.map((box, index) => (
        <div
          key={index}
          style={{
            position:"absolute",
            left:box.x ,
            top:box.y ,
            width:box.width,
            height:box.height,
            background:"red",
            clipPath:"polygon(50% 0%, 0% 100%, 100% 100%)",
            transform: box.side === "top"
              ? "rotate(180deg)"
              : "none",
            opacity:0.4,
            pointerEvents:"none"
          }}
        />
      ))}
    </>
  );
}
