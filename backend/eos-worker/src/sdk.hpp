#pragma once
#include "rust/cxx.h"
#include <memory>
namespace halo2::eos {
struct Config;struct Stat;struct Record;struct Proof;
class Sdk {
public:
  explicit Sdk(const Config&);~Sdk();
  void publish(rust::Str,rust::Slice<const Stat>);
  void query(rust::Str,rust::Slice<const rust::String>);
  rust::Vec<Stat> values(rust::Str,rust::Slice<const rust::String>)const;
  void leaderboard(rust::Str);
  rust::Vec<Record> records()const;
  void verify(rust::Str,rust::Str);
  Proof proof()const;
  std::int32_t poll();
private:struct Impl;std::unique_ptr<Impl> impl_;
};
std::unique_ptr<Sdk> create(const Config&);
}
