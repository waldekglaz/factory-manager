import { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Modal, ScrollView,
  TextInput, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { supabase } from "../../lib/supabase";
import { api } from "../../lib/api";

const STATUS_COLORS = {
  draft:    "#f59e0b",
  sent:     "#3b82f6",
  partial:  "#f59e0b",
  received: "#16a34a",
  cancelled:"#dc2626",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Badge({ status }) {
  const color = STATUS_COLORS[status] ?? "#64748b";
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

export default function GoodsIn() {
  const [pos,        setPOs]       = useState([]);
  const [locations,  setLocations] = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [receiving,  setReceiving] = useState(null);
  const [recvQty,    setRecvQty]   = useState({});
  const [recvLoc,    setRecvLoc]   = useState({});
  const [submitting, setSubmitting]= useState(false);
  const [success,    setSuccess]   = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!refreshing) setLoading(true);
    try {
      const [poData, locData] = await Promise.all([
        api.purchaseOrders.list(),
        api.locations.list(),
      ]);
      setPOs(poData.filter((p) => p.status !== "received" && p.status !== "cancelled"));
      setLocations(locData);
    } catch (err) {
      Alert.alert("Error loading data", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReceive = (po) => {
    const qty = {};
    const loc = {};
    po.lines.forEach((l) => {
      const remaining = l.quantityOrdered - l.quantityReceived;
      qty[l.id] = remaining > 0 ? String(remaining) : "0";
      loc[l.id] = "";
    });
    setRecvQty(qty);
    setRecvLoc(loc);
    setReceiving(po);
  };

  const handleReceive = async () => {
    const lines = receiving.lines
      .map((l) => ({
        lineId:           l.id,
        quantityReceived: Number(recvQty[l.id] ?? 0),
        ...(recvLoc[l.id] ? { locationId: Number(recvLoc[l.id]) } : {}),
      }))
      .filter((l) => l.quantityReceived > 0);

    if (lines.length === 0) {
      Alert.alert("Nothing to receive", "Enter at least one quantity.");
      return;
    }

    setSubmitting(true);
    try {
      await api.purchaseOrders.receive(receiving.id, { lines });
      const poId = receiving.id;
      setReceiving(null);
      setSuccess(`PO #${poId} received — stock updated`);
      setTimeout(() => setSuccess(""), 4000);
      await load();
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => supabase.auth.signOut() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {success ? <Text style={styles.successBanner}>{success}</Text> : null}

      <FlatList
        data={pos}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />
        }
        contentContainerStyle={pos.length === 0 ? styles.emptyContainer : styles.list}
        ListHeaderComponent={
          pos.length > 0 ? (
            <Text style={styles.sectionHeader}>{pos.length} pending delivery{pos.length !== 1 ? "s" : ""}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyText}>No active purchase orders to receive.</Text>
            <Text style={styles.emptyHint}>Pull down to refresh.</Text>
          </View>
        }
        renderItem={({ item: po }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{po.supplier.name}</Text>
              <Badge status={po.status} />
            </View>
            <Text style={styles.cardMeta}>PO #{po.id}</Text>
            <View style={styles.cardRow}>
              <View style={styles.cardStat}>
                <Text style={styles.cardStatLabel}>Expected</Text>
                <Text style={styles.cardStatValue}>{fmtDate(po.expectedDate)}</Text>
              </View>
              <View style={styles.cardStat}>
                <Text style={styles.cardStatLabel}>Lines</Text>
                <Text style={styles.cardStatValue}>{po.lines.length}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openReceive(po)}>
              <Text style={styles.primaryBtnText}>↓ Receive Goods</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        }
      />

      {/* ── Receive Modal ── */}
      <Modal visible={!!receiving} animationType="slide" presentationStyle="pageSheet">
        {receiving && (
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Receive Delivery</Text>
                <Text style={styles.modalSub}>PO #{receiving.id} · {receiving.supplier.name}</Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setReceiving(null)}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {receiving.lines.map((line) => {
                const remaining = line.quantityOrdered - line.quantityReceived;
                const fullyReceived = remaining <= 0;
                return (
                  <View key={line.id} style={styles.lineCard}>
                    <Text style={styles.lineName}>{line.part.name}</Text>
                    <Text style={styles.lineSub}>
                      Ordered: {line.quantityOrdered} {line.part.unit}
                      {"  ·  "}
                      Received: {line.quantityReceived}
                    </Text>

                    {fullyReceived ? (
                      <Text style={styles.fullReceived}>✓ Fully received</Text>
                    ) : (
                      <>
                        <Text style={styles.lineLabel}>Receive Now ({line.part.unit})</Text>
                        <TextInput
                          style={styles.qtyInput}
                          value={recvQty[line.id] ?? "0"}
                          onChangeText={(v) => setRecvQty({ ...recvQty, [line.id]: v })}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />

                        <Text style={styles.lineLabel}>Location (optional)</Text>
                        <View style={styles.pickerWrap}>
                          <Picker
                            selectedValue={recvLoc[line.id] ?? ""}
                            onValueChange={(v) => setRecvLoc({ ...recvLoc, [line.id]: v })}
                            style={styles.picker}
                          >
                            <Picker.Item label="— no location —" value="" />
                            {locations.map((loc) => (
                              <Picker.Item
                                key={loc.id}
                                label={loc.code ? `${loc.name} (${loc.code})` : loc.name}
                                value={String(loc.id)}
                              />
                            ))}
                          </Picker>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.confirmBtn, submitting && styles.btnDisabled]}
                onPress={handleReceive}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.confirmBtnText}>Confirm Receipt</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setReceiving(null)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#f8fafc" },
  centered:       { flex: 1, justifyContent: "center", alignItems: "center" },
  list:           { padding: 16 },
  emptyContainer: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  sectionHeader:  { fontSize: 12, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },

  empty:       { alignItems: "center" },
  emptyIcon:   { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 6 },
  emptyText:   { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 4 },
  emptyHint:   { fontSize: 12, color: "#94a3b8" },

  successBanner: { backgroundColor: "#dcfce7", color: "#15803d", padding: 12, textAlign: "center", fontSize: 13, fontWeight: "600" },

  card:          { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
  cardHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  cardTitle:     { fontSize: 16, fontWeight: "800", color: "#1e293b", flex: 1, marginRight: 8 },
  cardMeta:      { fontSize: 12, color: "#94a3b8", marginBottom: 12, fontFamily: "monospace" },
  cardRow:       { flexDirection: "row", gap: 16, marginBottom: 14 },
  cardStat:      { flex: 1 },
  cardStatLabel: { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: "600", marginBottom: 2 },
  cardStatValue: { fontSize: 14, color: "#334155", fontWeight: "700" },

  badge:         { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },

  primaryBtn:    { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  primaryBtnText:{ color: "#fff", fontSize: 15, fontWeight: "700" },

  logoutBtn:     { margin: 16, marginTop: 8, padding: 14, alignItems: "center" },
  logoutText:    { color: "#94a3b8", fontSize: 14, fontWeight: "600" },

  // Modal
  modal:         { flex: 1, backgroundColor: "#f8fafc" },
  modalHeader:   { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 20, paddingTop: 28, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  modalTitle:    { fontSize: 20, fontWeight: "800", color: "#1e293b" },
  modalSub:      { fontSize: 13, color: "#64748b", marginTop: 3 },
  closeBtn:      { width: 34, height: 34, borderRadius: 17, backgroundColor: "#f1f5f9", justifyContent: "center", alignItems: "center" },
  closeBtnText:  { fontSize: 16, color: "#64748b", fontWeight: "600" },
  modalScroll:   { flex: 1, padding: 16 },

  lineCard:     { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  lineName:     { fontSize: 15, fontWeight: "700", color: "#1e293b", marginBottom: 4 },
  lineSub:      { fontSize: 12, color: "#64748b", marginBottom: 10 },
  fullReceived: { fontSize: 13, color: "#16a34a", fontWeight: "700" },
  lineLabel:    { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 6, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  qtyInput:     { borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 18, fontWeight: "700", backgroundColor: "#f8fafc", marginBottom: 4, color: "#1e293b" },
  pickerWrap:   { borderWidth: 1.5, borderColor: "#e2e8f0", borderRadius: 10, backgroundColor: "#f8fafc", overflow: "hidden", marginBottom: 4 },
  picker:       { height: 44 },

  modalFooter:    { padding: 16, paddingBottom: 28, gap: 10, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#e2e8f0" },
  confirmBtn:     { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  ghostBtn:       { backgroundColor: "#f1f5f9", borderRadius: 12, paddingVertical: 15, alignItems: "center" },
  ghostBtnText:   { color: "#475569", fontSize: 16, fontWeight: "600" },
  btnDisabled:    { backgroundColor: "#93c5fd" },
});
