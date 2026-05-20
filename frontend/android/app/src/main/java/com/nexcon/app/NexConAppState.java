package com.nexcon.app;

final class NexConAppState {
    private static volatile boolean foreground;

    private NexConAppState() {
    }

    static boolean isForeground() {
        return foreground;
    }

    static void setForeground(boolean value) {
        foreground = value;
    }
}
