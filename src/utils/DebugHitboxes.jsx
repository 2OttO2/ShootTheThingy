export default function DebugHitboxes({ hitboxes }) {
  return (
    <>
      {hitboxes.map((box, index) => {

        const points = box.points
          .map(point => `${point.x}px ${point.y}px`)
          .join(",");

        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              background: "red",
              opacity: 0.4,
              clipPath: `polygon(${points})`,
              pointerEvents: "none",
              zIndex: 9999,
            }}
          />
        );

      })}
    </>
  );
}
