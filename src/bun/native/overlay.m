#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>

// Delegate that hides the window instead of closing it
@interface OverlayWindowDelegate : NSObject <NSWindowDelegate>
@property (nonatomic, weak) id originalDelegate;
@end

@implementation OverlayWindowDelegate

- (BOOL)windowShouldClose:(NSWindow *)sender {
    // Hide the window instead of closing
    [sender orderOut:nil];
    return NO;
}

- (void)windowDidResignKey:(NSNotification *)notification {
    NSWindow *window = notification.object;
    [window orderOut:nil];
}

// Forward any other delegate methods to the original delegate
- (BOOL)respondsToSelector:(SEL)aSelector {
    if (aSelector == @selector(windowShouldClose:)) return YES;
    if (aSelector == @selector(windowDidResignKey:)) return YES;
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) return YES;
    return [super respondsToSelector:aSelector];
}

- (id)forwardingTargetForSelector:(SEL)aSelector {
    if (self.originalDelegate && [self.originalDelegate respondsToSelector:aSelector]) {
        return self.originalDelegate;
    }
    return [super forwardingTargetForSelector:aSelector];
}

@end

static OverlayWindowDelegate *overlayDelegate = nil;
static NSWindow *registeredWindow = nil;
static EventHotKeyRef hotKeyRef = NULL;
static EventHandlerRef hotKeyHandlerRef = NULL;

// Callback invoked from native back into bun whenever the overlay window
// transitions from hidden to visible (hotkey-triggered show). Bun registers
// this via `setWindowShowCallback` — the mainview uses it to refresh the
// Claude session list without depending on webview-side visibility events.
typedef void (*WindowShowCallback)(void);
static WindowShowCallback windowShowCallback = NULL;

// Forward declaration
void makeWindowOverlay(void *nsWindowPtr);

static OSStatus hotkeyHandler(EventHandlerCallRef nextHandler, EventRef event, void *userData) {
    (void)nextHandler;
    (void)event;
    (void)userData;
    if (registeredWindow) {
        if ([registeredWindow isVisible]) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [registeredWindow orderOut:nil];
            });
        } else {
            makeWindowOverlay((__bridge void *)registeredWindow);
            if (windowShowCallback) {
                windowShowCallback();
            }
        }
    }
    return noErr;
}

void setWindowShowCallback(void *cb) {
    windowShowCallback = (WindowShowCallback)cb;
}

void makeWindowOverlay(void *nsWindowPtr) {
    if (!nsWindowPtr) return;
    NSWindow *window = (__bridge NSWindow *)nsWindowPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        // Install or re-install delegate to intercept close
        if (window.delegate != overlayDelegate) {
            if (!overlayDelegate) {
                overlayDelegate = [[OverlayWindowDelegate alloc] init];
            }
            overlayDelegate.originalDelegate = window.delegate;
            window.delegate = overlayDelegate;
        }

        [window setOpaque:NO];
        [window setBackgroundColor:[[NSColor blackColor] colorWithAlphaComponent:0.85]];
        [window setCollectionBehavior:
            NSWindowCollectionBehaviorMoveToActiveSpace |
            NSWindowCollectionBehaviorFullScreenAuxiliary];
        [window setLevel:NSStatusWindowLevel];

        // Center window on the screen under the pointer, falling back to main.
        NSScreen *screen = nil;
        NSPoint mouse = [NSEvent mouseLocation];
        for (NSScreen *candidate in [NSScreen screens]) {
            if (NSPointInRect(mouse, [candidate frame])) {
                screen = candidate;
                break;
            }
        }
        if (!screen) {
            screen = [NSScreen mainScreen];
        }
        if (screen) {
            NSRect screenFrame = [screen visibleFrame];
            NSRect windowFrame = [window frame];
            CGFloat x = NSMidX(screenFrame) - windowFrame.size.width / 2;
            CGFloat y = NSMidY(screenFrame) - windowFrame.size.height / 2;
            [window setFrameOrigin:NSMakePoint(x, y)];
        }

        [window orderFrontRegardless];
        [NSApp activateIgnoringOtherApps:YES];
    });
}


int registerHotkey(void *nsWindowPtr) {
    if (!nsWindowPtr) return paramErr;
    registeredWindow = (__bridge NSWindow *)nsWindowPtr;

    if (hotKeyRef) {
        UnregisterEventHotKey(hotKeyRef);
        hotKeyRef = NULL;
    }

    if (!hotKeyHandlerRef) {
        EventTypeSpec eventType = { kEventClassKeyboard, kEventHotKeyPressed };
        OSStatus handlerStatus = InstallApplicationEventHandler(&hotkeyHandler, 1, &eventType, NULL, &hotKeyHandlerRef);
        if (handlerStatus != noErr) {
            NSLog(@"[Hotkey] Failed to install hotkey handler: %d", (int)handlerStatus);
            return (int)handlerStatus;
        }
    }

    // Command+Shift+Space: kVK_Space=49, cmdKey+shiftKey
    EventHotKeyID hotKeyID = { 'PTol', 1 };
    UInt32 modifiers = cmdKey | shiftKey;
    OSStatus status = RegisterEventHotKey(49, modifiers, hotKeyID,
                                          GetApplicationEventTarget(), 0, &hotKeyRef);
    if (status == noErr) {
        NSLog(@"[Hotkey] Command+Shift+Space registered successfully");
    } else {
        NSLog(@"[Hotkey] Failed to register hotkey: %d", (int)status);
    }
    return (int)status;
}

void unregisterHotkey(void) {
    if (hotKeyRef) {
        UnregisterEventHotKey(hotKeyRef);
        hotKeyRef = NULL;
    }
    if (hotKeyHandlerRef) {
        RemoveEventHandler(hotKeyHandlerRef);
        hotKeyHandlerRef = NULL;
    }
    registeredWindow = nil;
    windowShowCallback = NULL;
}

// Override the NSStatusItem length to control the menu bar slot width.
// Electrobun's `width`/`height` only resize the rendered image — the slot length
// is independent and defaults to a value Electrobun chooses. We accept the FFI
// pointer Electrobun returns from createTray (a wrapper around NSStatusItem)
// and walk to the NSStatusItem via either direct cast or a `statusItem` getter.
void setTrayLength(void *trayPtr, double length) {
    if (!trayPtr) return;
    id obj = (__bridge id)trayPtr;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSStatusItem *item = nil;
        if ([obj isKindOfClass:[NSStatusItem class]]) {
            item = (NSStatusItem *)obj;
        } else if ([obj respondsToSelector:@selector(statusItem)]) {
            #pragma clang diagnostic push
            #pragma clang diagnostic ignored "-Warc-performSelector-leaks"
            item = (NSStatusItem *)[obj performSelector:@selector(statusItem)];
            #pragma clang diagnostic pop
        }
        if (item) {
            [item setLength:length];
        } else {
            NSLog(@"[Tray] setTrayLength: cannot resolve NSStatusItem from %@", NSStringFromClass([obj class]));
        }
    });
}

void quitApp(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        unregisterHotkey();
        [NSApp terminate:nil];
    });
}
