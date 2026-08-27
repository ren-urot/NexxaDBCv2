import logo from "../assets/nexxa-logo.svg";

export default function Logo({ height = 20 }: { height?: number }) {
  return <img src={logo} alt="NexxaDBC" style={{ height, width: "auto" }} />;
}
