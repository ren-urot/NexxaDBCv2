import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Builder from "./pages/Builder";
import Holder from "./pages/Holder";
import Admin from "./pages/Admin";
import AboutUs from "./pages/AboutUs";
import TransferClaim from "./pages/TransferClaim";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/builder" element={<Builder />} />
      <Route path="/holder" element={<Holder />} />
      <Route path="/holder/:orderCode" element={<Holder />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/about" element={<AboutUs />} />
      <Route path="/transfer/:token" element={<TransferClaim />} />
    </Routes>
  );
}
