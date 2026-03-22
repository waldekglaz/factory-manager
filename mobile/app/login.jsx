import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter email and password."); return; }
    setError("");
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;

      const role = data.user?.user_metadata?.role ?? "manager";
      if (role !== "dispatcher" && role !== "manager") {
        await supabase.auth.signOut();
        setError("Access denied — this app is for dispatchers only.");
        return;
      }
      // Navigation happens automatically via _layout.jsx auth listener
    } catch (err) {
      setError(err.message || "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoRow}>
          <Text style={styles.logoIcon}>🏭</Text>
          <Text style={styles.logoText}>Factory Manager</Text>
        </View>
        <Text style={styles.subtitle}>Dispatcher</Text>

        <View style={styles.card}>
          {error ? <Text style={styles.errorBox}>{error}</Text> : null}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer:         { flex: 1, backgroundColor: "#f8fafc" },
  container:     { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoRow:       { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  logoIcon:      { fontSize: 32, marginRight: 10 },
  logoText:      { fontSize: 28, fontWeight: "800", color: "#1e293b" },
  subtitle:      { textAlign: "center", fontSize: 15, color: "#64748b", marginBottom: 32, letterSpacing: 1, textTransform: "uppercase", fontWeight: "600" },
  card:          { backgroundColor: "#fff", borderRadius: 20, padding: 28, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, elevation: 6 },
  errorBox:      { backgroundColor: "#fee2e2", color: "#dc2626", padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 13, lineHeight: 18 },
  label:         { fontSize: 13, fontWeight: "700", color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input:         { borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, marginBottom: 18, backgroundColor: "#f8fafc", color: "#1e293b" },
  button:        { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  buttonDisabled:{ backgroundColor: "#93c5fd" },
  buttonText:    { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});
