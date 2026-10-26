import { BlogPost as BlogPostType } from '@/types/blog';

export const topOpenSourceProjects2026Post: BlogPostType = {
  id: 'top-50-most-active-open-source-projects-2026',
  slug: 'top-50-most-active-open-source-projects-2026',
  title: 'Top 50 Most Active Open Source Projects 2026, Ranked by GitHub Activity',
  seoTitle: 'Top 50 Most Active Open Source Projects 2026 (GitHub Data) | DeHub',
  seoDescription: 'The 50 most active open source projects of 2026, ranked on real GitHub commits and contributors over 90 days. Linux, Chromium, Nixpkgs, LLVM, Firefox, vLLM, PyTorch and more.',
  excerpt: 'We measured the GitHub history of 205 of the biggest open source projects and ranked the 50 most active on commits and contributors over the last 90 days. Linux, Chromium and Nixpkgs lead, and AI projects take 12 of the 50 spots.',
  content: `Which open source projects are actually being built the hardest right now? We measured the public GitHub history of 205 of the world's biggest open source projects and ranked the top 50 on two things: **how much code they shipped and how many people shipped it**. Every number below comes straight from each project's own public repository, so anyone can check it.

![Open Source Activity Index 2026: how we ranked 50 open source projects on GitHub activity](/media/fig-oss-method.jpg)

## How we ranked the 50 most active open source projects

Each project gets a score out of 100, made of two halves.

- **Commits (50 points):** changes merged into the main branch of the project's main GitHub repository in the last 90 days, from 28 July to 26 October 2026. Merge commits are not counted.
- **Contributors (50 points):** the number of different people who wrote those commits.
- **Log scale:** both halves use a log scale against the leader, so a project with ten times more commits gets more points but not ten times more. This stops one giant codebase from drowning out everything else, and rewards projects that are busy and broad at the same time.
- **Bots removed:** commits from automated accounts such as Dependabot, Renovate, release bots and translation bots are left out.
- **What counts:** OSI-approved open source licenses only, so source-available projects such as Sentry, n8n and Dify are left out. Some projects, such as Chromium, GCC, QEMU, FFmpeg and Blender, develop elsewhere and mirror to GitHub. We counted their mirrors, because the code and history are the same. Crypto and blockchain projects get [their own list](/guides/top-50-blockchain-projects-2026).

Data was pulled on 26 October 2026. Activity moves week to week, so treat the exact order as a snapshot.

## The top 10 at a glance

![The top 10 most active open source projects in 2026: Linux, Chromium, Nixpkgs, LLVM, Firefox, Zephyr, ClickHouse, vLLM, Home Assistant and IntelliJ IDEA](/media/fig-oss-top10.jpg)

Linux takes the top spot with 3,544 different people landing code in just 90 days, more than any other project we measured. Chromium shipped the most commits of all, 44,269, which works out to almost 500 a day. Between them, the top 50 merged 364,577 commits in three months, and their contributor lists add up to more than 25,000 names.

## The full top 50

1. **Linux**: 97.4/100. 25,370 commits, 3,544 contributors. The kernel behind Android, most servers and the cloud. [torvalds/linux](https://github.com/torvalds/linux)
2. **Chromium**: 95.9/100. 44,269 commits, 1,824 contributors. The open source core of Chrome, Edge, Brave and Opera. [chromium/chromium](https://github.com/chromium/chromium)
3. **Nixpkgs**: 92.9/100. 21,300 commits, 1,928 contributors. The package collection behind NixOS and the Nix package manager. [NixOS/nixpkgs](https://github.com/NixOS/nixpkgs)
4. **LLVM**: 90.1/100. 14,396 commits, 1,664 contributors. The compiler toolkit behind Clang, Swift, Rust and many other languages. [llvm/llvm-project](https://github.com/llvm/llvm-project)
5. **Firefox**: 88.4/100. 20,038 commits, 968 contributors. Mozilla's independent web browser. [mozilla-firefox/firefox](https://github.com/mozilla-firefox/firefox)
6. **Zephyr**: 84.6/100. 9,783 commits, 911 contributors. A real-time operating system for small and connected devices. [zephyrproject-rtos/zephyr](https://github.com/zephyrproject-rtos/zephyr)
7. **ClickHouse**: 84.3/100. 22,887 commits, 449 contributors. A very fast database for analytics. [ClickHouse/ClickHouse](https://github.com/ClickHouse/ClickHouse)
8. **vLLM**: 82.7/100. 4,634 commits, 1,181 contributors. The most popular engine for serving large language models. [vllm-project/vllm](https://github.com/vllm-project/vllm)
9. **Home Assistant**: 82.6/100. 7,825 commits, 779 contributors. A smart home platform you run yourself. [home-assistant/core](https://github.com/home-assistant/core)
10. **IntelliJ IDEA Community**: 82.1/100. 13,226 commits, 475 contributors. The open core of JetBrains' coding tools. [JetBrains/intellij-community](https://github.com/JetBrains/intellij-community)
11. **Homebrew**: 81.3/100. 19,093 commits, 316 contributors. The package manager for macOS and Linux. [Homebrew/homebrew-core](https://github.com/Homebrew/homebrew-core)
12. **SGLang**: 80.6/100. 5,084 commits, 773 contributors. A fast serving engine for large language models. [sgl-project/sglang](https://github.com/sgl-project/sglang)
13. **PyTorch**: 80.0/100. 4,446 commits, 774 contributors. The deep learning framework most AI research is built on. [pytorch/pytorch](https://github.com/pytorch/pytorch)
14. **Rust**: 79.6/100. 5,882 commits, 589 contributors. The memory-safe programming language and its compiler. [rust-lang/rust](https://github.com/rust-lang/rust)
15. **Odoo**: 79.5/100. 4,634 commits, 700 contributors. Open source business apps: CRM, accounting, inventory and more. [odoo/odoo](https://github.com/odoo/odoo)
16. **Expensify**: 77.7/100. 15,184 commits, 210 contributors. The expense and payments app, built in public with paid bounties. [Expensify/App](https://github.com/Expensify/App)
17. **PostHog**: 77.6/100. 15,537 commits, 201 contributors. Product analytics, session replay and feature flags. [PostHog/posthog](https://github.com/PostHog/posthog)
18. **Kibana**: 76.4/100. 6,186 commits, 335 contributors. The dashboard and search interface for Elasticsearch. [elastic/kibana](https://github.com/elastic/kibana)
19. **TensorFlow**: 75.5/100. 4,175 commits, 395 contributors. Google's machine learning framework. [tensorflow/tensorflow](https://github.com/tensorflow/tensorflow)
20. **WebKit**: 74.9/100. 6,686 commits, 249 contributors. The browser engine behind Safari. [WebKit/WebKit](https://github.com/WebKit/WebKit)
21. **DuckDB**: 73.8/100. 6,249 commits, 219 contributors. A small, fast analytics database that runs inside your app. [duckdb/duckdb](https://github.com/duckdb/duckdb)
22. **VS Code**: 73.5/100. 6,191 commits, 209 contributors. Microsoft's code editor. [microsoft/vscode](https://github.com/microsoft/vscode)
23. **Unsloth**: 73.4/100. 5,882 commits, 215 contributors. Fast, low-memory fine-tuning for large language models. [unslothai/unsloth](https://github.com/unslothai/unsloth)
24. **Codex CLI**: 73.1/100. 3,984 commits, 274 contributors. OpenAI's coding agent for the terminal. [openai/codex](https://github.com/openai/codex)
25. **Apache Airflow**: 72.5/100. 2,307 commits, 381 contributors. A scheduler for data pipelines and workflows. [apache/airflow](https://github.com/apache/airflow)
26. **Grafana**: 72.4/100. 3,261 commits, 286 contributors. Dashboards and monitoring. [grafana/grafana](https://github.com/grafana/grafana)
27. **llama.cpp**: 72.3/100. 1,754 commits, 449 contributors. Run large language models on your own computer. [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)
28. **FreeBSD**: 71.9/100. 2,916 commits, 286 contributors. A complete Unix-like operating system. [freebsd/freebsd-src](https://github.com/freebsd/freebsd-src)
29. **ESPHome**: 71.4/100. 2,815 commits, 271 contributors. Firmware for DIY smart home devices. [esphome/esphome](https://github.com/esphome/esphome)
30. **Terraform AWS Provider**: 71.2/100. 8,414 commits, 114 contributors. Manage Amazon Web Services with Terraform and OpenTofu. [hashicorp/terraform-provider-aws](https://github.com/hashicorp/terraform-provider-aws)
31. **OpenXLA**: 71.0/100. 2,444 commits, 281 contributors. The machine learning compiler behind JAX and TensorFlow. [openxla/xla](https://github.com/openxla/xla)
32. **AMD ROCm Libraries**: 71.0/100. 2,409 commits, 284 contributors. The maths and AI libraries for AMD GPUs. [ROCm/rocm-libraries](https://github.com/ROCm/rocm-libraries)
33. **GCC**: 70.9/100. 2,858 commits, 248 contributors. The GNU Compiler Collection. [gcc-mirror/gcc](https://github.com/gcc-mirror/gcc)
34. **Elasticsearch**: 70.8/100. 3,290 commits, 219 contributors. The search and analytics engine. [elastic/elasticsearch](https://github.com/elastic/elasticsearch)
35. **QEMU**: 70.6/100. 2,723 commits, 245 contributors. A machine emulator and virtualizer. [qemu/qemu](https://github.com/qemu/qemu)
36. **Kotlin**: 70.5/100. 4,491 commits, 165 contributors. The programming language for Android and the JVM. [JetBrains/kotlin](https://github.com/JetBrains/kotlin)
37. **pnpm**: 70.1/100. 2,325 commits, 252 contributors. A fast, disk-saving JavaScript package manager. [pnpm/pnpm](https://github.com/pnpm/pnpm)
38. **Zed**: 70.0/100. 1,305 commits, 389 contributors. A fast, multiplayer code editor with built-in AI. [zed-industries/zed](https://github.com/zed-industries/zed)
39. **Python (CPython)**: 69.2/100. 1,452 commits, 312 contributors. The main implementation of the Python language. [python/cpython](https://github.com/python/cpython)
40. **opencode**: 68.9/100. 4,193 commits, 134 contributors. An open source AI coding agent for the terminal. [sst/opencode](https://github.com/sst/opencode)
41. **OpenWrt**: 68.5/100. 2,165 commits, 207 contributors. Linux for Wi-Fi routers. [openwrt/openwrt](https://github.com/openwrt/openwrt)
42. **Kilo Code**: 68.4/100. 3,674 commits, 136 contributors. An open source AI coding agent for VS Code and the terminal. [Kilo-Org/kilocode](https://github.com/Kilo-Org/kilocode)
43. **TensorRT-LLM**: 68.1/100. 1,954 commits, 210 contributors. NVIDIA's library for fast language model inference. [NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)
44. **Blender**: 68.0/100. 2,581 commits, 167 contributors. The 3D creation suite. [blender/blender](https://github.com/blender/blender)
45. **FFmpeg**: 68.0/100. 2,276 commits, 182 contributors. The audio and video toolkit almost every video app relies on. [FFmpeg/FFmpeg](https://github.com/FFmpeg/FFmpeg)
46. **Swift**: 67.8/100. 2,625 commits, 160 contributors. Apple's programming language. [swiftlang/swift](https://github.com/swiftlang/swift)
47. **Supabase**: 67.8/100. 1,717 commits, 220 contributors. An open source backend: Postgres database, auth and storage. [supabase/supabase](https://github.com/supabase/supabase)
48. **Node.js**: 67.8/100. 1,559 commits, 235 contributors. The JavaScript runtime for servers. [nodejs/node](https://github.com/nodejs/node)
49. **systemd**: 67.6/100. 1,818 commits, 202 contributors. The system and service manager in most Linux distributions. [systemd/systemd](https://github.com/systemd/systemd)
50. **Gutenberg**: 67.6/100. 2,310 commits, 170 contributors. The WordPress block editor. [WordPress/gutenberg](https://github.com/WordPress/gutenberg)

## AI is the fastest-moving corner of open source

![12 of the 50 most active open source projects are AI projects, led by vLLM, SGLang and PyTorch](/media/fig-oss-ai.jpg)

Twelve of the top 50 are AI projects, more than any other category. Three stand out.

- **vLLM (#8)** has 1,181 contributors, the fifth-highest of every project we measured, behind only Linux, Nixpkgs, Chromium and LLVM. It started as a UC Berkeley research project in 2023.
- **SGLang (#12)** and **PyTorch (#13)** each drew about 770 contributors, as every major AI lab now contributes to the shared tools that serve and train models.
- **Coding agents are now a category of their own.** OpenAI's Codex CLI (#24), opencode (#40) and Kilo Code (#42) each shipped more than 3,500 commits in 90 days.

## Operating systems still have the biggest crowds

Linux, Nixpkgs, Zephyr, Homebrew, FreeBSD, QEMU, OpenWrt and systemd make up eight of the top 50. Nixpkgs is the quiet giant: almost 2,000 people updated its package collection in 90 days, the second-largest crowd on the list after Linux. Zephyr, the operating system for small connected devices, has grown into the sixth most active project of all as chip makers build on it together.

## Browsers and developer tools

The three browser engines, Chromium, Firefox and WebKit, all make the top 20. Developer tools fill eleven spots: LLVM, Rust, Kotlin, Swift, Python, Node.js and GCC show that programming languages are still built in the open, while VS Code, IntelliJ IDEA and Zed show the same for code editors. pnpm is the only package manager for JavaScript in the top 50.

## Apps and data tools built in public

Some of the busiest projects are companies building their main product in public. PostHog (15,537 commits), Expensify (15,184) and ClickHouse (22,887) each landed more commits than LLVM (14,396), from teams of a few hundred people. Home Assistant and ESPHome show how big the smart home community has become, with more than 1,000 contributors between them.

## Big names that missed the top 50

- **Kubernetes** came 55th. It is still huge, but much of its work now happens in separate repositories around the main one.
- **React** had only 138 commits from 46 contributors in 90 days. **Next.js**, **Go** and **TypeScript** were also outside the top 50. Mature projects change more slowly, and that is not a bad sign.
- **Ladybird**, the new independent browser, shipped 8,961 commits, more than all but 11 projects, but from just 15 contributors.

## Where DeHub fits

![DeHub built in public: over 5,400 commits in 90 days from a small team](/media/fig-oss-dehub.jpg)

We publish this index, so here is how our own open source code compares. DeHub's web and mobile apps landed **5,436 commits in the same 90 days**, more than PyTorch, TensorFlow or Kubernetes, and enough to place 22nd on commits alone. DeHub is not in the top 50 because the index also rewards the size of the crowd, and our core team is small. What makes up the difference is the community: anyone can file a request on [dehub.io/features](https://dehub.io/features) and watch it get built, often the same day.

> Disclosure: DeHub publishes this index. DeHub's own numbers come from its public repositories, measured in the same way as everyone else's.

## Frequently asked questions

### What is the most active open source project in 2026?

Linux, by our measure. It had 25,370 commits from 3,544 contributors between 28 July and 26 October 2026. Chromium shipped more commits, 44,269, but from about half as many people.

### How did you measure GitHub activity?

We downloaded the commit history of each project's main GitHub repository and counted commits on the default branch over 90 days, plus the number of different authors. Merge commits and bot accounts were removed, and both numbers were scored on a log scale out of 50.

### Why are Kubernetes and React not in the top 50?

Both are still very active as wider ecosystems, but their main repositories change less than they used to. Kubernetes splits its work across many repositories, and React is a mature library that ships fewer, larger changes.

### Which AI open source projects are the most active?

vLLM, SGLang, PyTorch, TensorFlow, Unsloth, OpenAI's Codex CLI, llama.cpp, OpenXLA, AMD's ROCm libraries, opencode, Kilo Code and TensorRT-LLM all made the top 50.

### Can I contribute to these projects?

Yes. Every project on this list accepts contributions, and most label easy starter issues as "good first issue" on GitHub. For a different way in, our [Top 50 decentralized social apps](/guides/top-50-decentralized-social-apps-2026) ranks the most active open social networks, many of them open source too.

## Sources

- Public commit history on GitHub for all 205 projects measured, pulled on 26 October 2026. Each repository is linked in the list above.
- [Open Source Initiative list of approved licenses](https://opensource.org/licenses)
- [DeHub on GitHub](https://github.com/DeHubToken/dehubweb)

## Build with us

DeHub is a social and streaming app that is built in public, every day. Open [dehub.io](https://dehub.io), post a feature request on [dehub.io/features](https://dehub.io/features), and watch the community build it. You can also get the app on [Google Play](https://play.google.com/store/apps/details?id=io.dehub.mobile).`,
  bannerImage: '/media/top-50-most-active-open-source-projects-2026-banner.png',
  bannerImageAlt: 'Top 50 most active open source projects 2026, ranked by GitHub activity, by DeHub',
  author: { name: 'DeHub Team' },
  publishedAt: '2026-10-26T20:00:00.000Z',
  tags: ['open source', 'top 50', 'GitHub', 'most active open source projects', 'Linux', 'Chromium', 'AI', 'vLLM', 'PyTorch', 'developer tools', 'DeHub'],
  readingTime: 10,
  featured: true,
  status: 'published',
};
